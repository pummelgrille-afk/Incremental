import {
  noUpgradeEffects,
  UPGRADE_BRANCHES,
  type UpgradeBranch,
  type UpgradeEffects,
  type UpgradeNodeDef,
} from '../entities/Upgrade'
import { UPGRADE_NODES, upgradeById } from '../content/upgrades'
import { TREE } from '../content/economy'
import { parseStageAddress } from '../entities/Zone'
import { zoneById } from '../content/zones'
import { isBossStage } from '../systems/scaling'
import { fnv1a } from '../utils/hash'
import type { SaveData } from '../core/saveSchema'

export type UnavailableReason =
  | 'purchased'
  | 'missing-prerequisite'
  | 'unaffordable'

export interface NodeStatus {
  node: UpgradeNodeDef
  purchased: boolean

  unlocked: boolean
  affordable: boolean
  cost: number

  blockedBy: UnavailableReason | null
}

function purchasedSet(save: SaveData): Set<string> {
  return new Set(save.meta.purchasedNodes)
}

export function branchDepth(save: SaveData, branch: UpgradeBranch): number {
  let depth = 0
  for (const id of save.meta.purchasedNodes) {
    if (upgradeById(id)?.branch === branch) depth++
  }
  return depth
}

export function nodeCost(save: SaveData, node: UpgradeNodeDef): number {
  return Math.ceil(node.baseCost * TREE.nodeCostGrowth ** branchDepth(save, node.branch))
}

export function isPurchased(save: SaveData, nodeId: string): boolean {
  return save.meta.purchasedNodes.includes(nodeId)
}

export function isUnlocked(save: SaveData, node: UpgradeNodeDef): boolean {
  if (node.requires.length === 0) return true
  const owned = purchasedSet(save)
  return node.requires.every((id) => owned.has(id))
}

export function statusOf(save: SaveData, node: UpgradeNodeDef): NodeStatus {
  const purchased = isPurchased(save, node.id)
  const unlocked = isUnlocked(save, node)
  const cost = nodeCost(save, node)
  const affordable = save.meta.recollection >= cost

  let blockedBy: UnavailableReason | null = null
  if (purchased) blockedBy = 'purchased'
  else if (!unlocked) blockedBy = 'missing-prerequisite'
  else if (!affordable) blockedBy = 'unaffordable'

  return { node, purchased, unlocked, affordable, cost, blockedBy }
}

export function treeStatus(save: SaveData): NodeStatus[] {
  return UPGRADE_NODES.map((node) => statusOf(save, node))
}

export function purchase(save: SaveData, nodeId: string): boolean {
  const node = upgradeById(nodeId)
  if (!node) return false

  const status = statusOf(save, node)
  if (status.blockedBy !== null) return false

  save.meta.recollection -= status.cost
  save.meta.purchasedNodes.push(node.id)
  return true
}

export function refundValue(save: SaveData): number {
  let total = 0
  for (const branch of UPGRADE_BRANCHES) {
    const owned = save.meta.purchasedNodes
      .map((id) => upgradeById(id))
      .filter((node): node is UpgradeNodeDef => node?.branch === branch)

    owned
      .sort((a, b) => a.baseCost - b.baseCost)
      .forEach((node, index) => {
        total += Math.ceil(node.baseCost * TREE.nodeCostGrowth ** index)
      })
  }
  return total
}

export function respec(save: SaveData): number {
  const refund = refundValue(save)
  save.meta.recollection += refund
  save.meta.purchasedNodes = []
  return refund
}

export function effectsOf(save: SaveData): UpgradeEffects {
  const effects = noUpgradeEffects()

  for (const id of save.meta.purchasedNodes) {
    const node = upgradeById(id)
    if (!node) continue
    for (const effect of node.effects) {
      effects[effect.kind] += effect.magnitude
    }
  }

  return effects
}

export interface TreeProblem {
  nodeId: string
  problem: string
}

export function validateTree(nodes: readonly UpgradeNodeDef[] = UPGRADE_NODES): TreeProblem[] {
  const problems: TreeProblem[] = []
  const byId = new Map(nodes.map((n) => [n.id, n]))

  if (byId.size !== nodes.length) {
    problems.push({ nodeId: '*', problem: 'duplicate node ids' })
  }

  for (const node of nodes) {
    if (node.baseCost <= 0) {
      problems.push({ nodeId: node.id, problem: 'baseCost must be positive' })
    }
    if (node.tier < 1) {
      problems.push({ nodeId: node.id, problem: 'tier is 1-based' })
    }
    if (node.effects.length === 0) {
      problems.push({ nodeId: node.id, problem: 'node does nothing' })
    }

    for (const required of node.requires) {
      const prerequisite = byId.get(required)
      if (!prerequisite) {
        problems.push({ nodeId: node.id, problem: `requires unknown node "${required}"` })
        continue
      }
      if (prerequisite.branch !== node.branch) {
        problems.push({
          nodeId: node.id,
          problem: `requires "${required}" from another branch`,
        })
      }
      if (prerequisite.tier >= node.tier) {
        problems.push({
          nodeId: node.id,
          problem: `requires "${required}" from tier ${prerequisite.tier}, not below tier ${node.tier}`,
        })
      }
    }
  }

  for (const node of nodes) {
    const seen = new Set<string>([node.id])
    const stack = [...node.requires]
    while (stack.length > 0) {
      const id = stack.pop()!
      if (seen.has(id)) {
        problems.push({ nodeId: node.id, problem: `prerequisite cycle through "${id}"` })
        break
      }
      seen.add(id)
      stack.push(...(byId.get(id)?.requires ?? []))
    }
  }

  for (const branch of UPGRADE_BRANCHES) {
    const inBranch = nodes.filter((n) => n.branch === branch)
    if (inBranch.length > 0 && !inBranch.some((n) => n.requires.length === 0)) {
      problems.push({ nodeId: branch, problem: 'branch has no root node' })
    }
  }

  return problems
}

export interface PathStep {
  node: UpgradeNodeDef

  cost: number
}

export interface PathPreview {
  steps: PathStep[]

  total: number
  affordable: boolean
}

export function pathTo(save: SaveData, nodeId: string): PathPreview {
  const target = upgradeById(nodeId)
  if (!target) return { steps: [], total: 0, affordable: false }

  const owned = purchasedSet(save)
  const ordered: UpgradeNodeDef[] = []
  const seen = new Set<string>()

  const visit = (node: UpgradeNodeDef): void => {
    if (owned.has(node.id) || seen.has(node.id)) return
    seen.add(node.id)
    for (const id of node.requires) {
      const prerequisite = upgradeById(id)
      if (prerequisite) visit(prerequisite)
    }
    ordered.push(node)
  }
  visit(target)

  const depths = new Map<UpgradeBranch, number>()
  for (const branch of UPGRADE_BRANCHES) depths.set(branch, branchDepth(save, branch))

  let total = 0
  const steps = ordered.map((node) => {
    const depth = depths.get(node.branch) ?? 0
    const cost = Math.ceil(node.baseCost * TREE.nodeCostGrowth ** depth)
    depths.set(node.branch, depth + 1)
    total += cost
    return { node, cost }
  })

  return { steps, total, affordable: save.meta.recollection >= total }
}

export interface NodeLayout {
  nodeId: string
  x: number
  y: number
  branch: UpgradeBranch
}

const BRANCH_ARC = (Math.PI * 2) / 4

const TIER_SPACING = 110

const FIRST_TIER_RADIUS = 130

const ANGULAR_DRIFT = 0.06
const RADIAL_DRIFT = 24

function drift(nodeId: string, axis: string): number {
  return (fnv1a(`${axis}:${nodeId}`) / 0xffffffff) * 2 - 1
}

export function treeLayout(nodes: readonly UpgradeNodeDef[] = UPGRADE_NODES): NodeLayout[] {
  const layout: NodeLayout[] = []

  UPGRADE_BRANCHES.forEach((branch, branchIndex) => {
    const inBranch = nodes.filter((n) => n.branch === branch)
    const byTier = new Map<number, UpgradeNodeDef[]>()
    for (const node of inBranch) {
      const tier = byTier.get(node.tier) ?? []
      tier.push(node)
      byTier.set(node.tier, tier)
    }

    const centre = branchIndex * BRANCH_ARC + BRANCH_ARC / 2 - Math.PI / 2

    for (const [tier, tierNodes] of byTier) {
      const radius = FIRST_TIER_RADIUS + (tier - 1) * TIER_SPACING

      const usable = BRANCH_ARC * 0.7
      tierNodes.forEach((node, index) => {
        const offset =
          tierNodes.length === 1
            ? 0
            : (index / (tierNodes.length - 1) - 0.5) * usable
        const angle = centre + offset + drift(node.id, 'angle') * ANGULAR_DRIFT
        const distance = radius + drift(node.id, 'radius') * RADIAL_DRIFT
        layout.push({
          nodeId: node.id,
          x: Math.cos(angle) * distance,
          y: Math.sin(angle) * distance,
          branch,
        })
      })
    }
  })

  return layout
}

export function isTreeRevealed(save: SaveData): boolean {
  if (save.meta.rewindCount > 0) return true

  return save.meta.clearedStages.some((address) => {
    const { zoneId, stageId } = parseStageAddress(address)
    const stage = zoneById(zoneId)?.stages.find((s) => s.id === stageId)
    return stage ? isBossStage(stage.scalingIndex) : false
  })
}
