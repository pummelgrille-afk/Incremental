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
import type { SaveData } from '../core/saveSchema'

/**
 * The Escapement Tree.
 *
 * Bought with Recollection, persists through every Rewind (economy-spec.md §2).
 * Like `currencies.ts`, everything here is a **pure function of the save plus
 * its arguments** — nothing reaches into a running simulation, and the effects
 * a run is played with are read once at stage load.
 *
 * Purchases are stored as a **set of ids** in `meta.purchasedNodes`, never as
 * objects and never with their costs. Cost is recomputed from how many nodes
 * the branch holds, so re-balancing the curve in Phase 34 cannot strand a save
 * that was priced under the old one.
 */

export type UnavailableReason =
  | 'purchased'
  | 'missing-prerequisite'
  | 'unaffordable'

export interface NodeStatus {
  node: UpgradeNodeDef
  purchased: boolean
  /** Every prerequisite is purchased. Affordability is separate. */
  unlocked: boolean
  affordable: boolean
  cost: number
  /** Why it cannot be bought right now, or null when it can. */
  blockedBy: UnavailableReason | null
}

function purchasedSet(save: SaveData): Set<string> {
  return new Set(save.meta.purchasedNodes)
}

/** How many nodes of a branch are already owned — the cost driver. */
export function branchDepth(save: SaveData, branch: UpgradeBranch): number {
  let depth = 0
  for (const id of save.meta.purchasedNodes) {
    if (upgradeById(id)?.branch === branch) depth++
  }
  return depth
}

/**
 * `baseCost × growth^(nodes already owned in this branch)`.
 *
 * The growth keys on the **branch**, not the whole tree, which is what makes
 * spreading investment cheaper than driving one branch deep. That is the
 * intended shape: a player who wants a specialist build pays for the privilege
 * rather than being handed it.
 */
export function nodeCost(save: SaveData, node: UpgradeNodeDef): number {
  return Math.ceil(node.baseCost * TREE.nodeCostGrowth ** branchDepth(save, node.branch))
}

export function isPurchased(save: SaveData, nodeId: string): boolean {
  return save.meta.purchasedNodes.includes(nodeId)
}

/** Every prerequisite purchased. Says nothing about affording it. */
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

/** Status of every node, for the Phase 23 tree view. */
export function treeStatus(save: SaveData): NodeStatus[] {
  return UPGRADE_NODES.map((node) => statusOf(save, node))
}

/**
 * Buy a node, or refuse.
 *
 * Returns false rather than throwing: an unaffordable or locked node is an
 * ordinary UI state, not an error. Nothing partial happens on a refusal.
 */
export function purchase(save: SaveData, nodeId: string): boolean {
  const node = upgradeById(nodeId)
  if (!node) return false

  const status = statusOf(save, node)
  if (status.blockedBy !== null) return false

  save.meta.recollection -= status.cost
  save.meta.purchasedNodes.push(node.id)
  return true
}

/**
 * Total Recollection sunk into the tree, at current prices.
 *
 * This is what a respec refunds. Recomputed from the branch curves rather than
 * remembered per purchase, so a Phase 34 re-balance refunds what the nodes are
 * worth *now* — remembering old prices would let a player bank the difference
 * across a cost change, or lose out to one.
 */
export function refundValue(save: SaveData): number {
  let total = 0
  for (const branch of UPGRADE_BRANCHES) {
    const owned = save.meta.purchasedNodes
      .map((id) => upgradeById(id))
      .filter((node): node is UpgradeNodeDef => node?.branch === branch)

    // Price them back down the curve in the order they would have been bought.
    owned
      .sort((a, b) => a.baseCost - b.baseCost)
      .forEach((node, index) => {
        total += Math.ceil(node.baseCost * TREE.nodeCostGrowth ** index)
      })
  }
  return total
}

/**
 * Refund the whole tree.
 *
 * **Free, and only between runs** (economy-spec.md §2). Charging for a respec
 * would punish experimenting with formations, which is the game's main
 * pleasure — the cost of a wrong build is already the time spent on it.
 *
 * The caller owns the "between runs" check; this function cannot see whether a
 * stage is in progress, and inventing a way for it to would put run state into
 * a module that deliberately only knows about the save.
 */
export function respec(save: SaveData): number {
  const refund = refundValue(save)
  save.meta.recollection += refund
  save.meta.purchasedNodes = []
  return refund
}

/**
 * Sum every purchased node into the aggregate a run is played with.
 *
 * **Additive, never multiplicative.** Across ~72 nodes, multiplicative stacking
 * compounds past any curve `balancing.csv` can hold — economy-spec.md §7 caps
 * the type matrix at 1.5× for the same reason.
 *
 * Unknown ids are skipped rather than throwing: a save must survive content
 * changing between versions (saveSchema.ts), and a node removed in Phase 34
 * must not make an old save unloadable.
 */
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

/**
 * Validate the authored graph.
 *
 * Run by test rather than at load: a broken tree is a content bug to fail
 * loudly on in CI, not something to discover in a player's save.
 */
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

  // Cycles. Tier ordering already forbids them, but only while tiers are
  // authored correctly — and a cycle would hang any traversal the UI does.
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

  // Every branch needs a way in, or its nodes are unreachable forever.
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
  /** What this node costs at the point in the path it is reached. */
  cost: number
}

export interface PathPreview {
  /** Nodes still to buy, in a buyable order. Empty when already purchased. */
  steps: PathStep[]
  /** Everything the path costs together. */
  total: number
  affordable: boolean
}

/**
 * What reaching a node would cost, prerequisites included.
 *
 * **Not a sum of `nodeCost`.** Each purchase raises its branch's depth, so the
 * second node in a chain is dearer than it looks today — quoting the sum of
 * current prices would under-quote every multi-step path, which is the one
 * thing a planning affordance must not do.
 *
 * Simulated against a scratch tally rather than the real save, so asking the
 * question never changes the answer.
 */
export function pathTo(save: SaveData, nodeId: string): PathPreview {
  const target = upgradeById(nodeId)
  if (!target) return { steps: [], total: 0, affordable: false }

  const owned = purchasedSet(save)
  const ordered: UpgradeNodeDef[] = []
  const seen = new Set<string>()

  // Depth-first through prerequisites, emitting each before its dependents.
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

  // Walk the branch curves forward as the path is bought.
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

/** Radians per branch. Four branches, so a quadrant each. */
const BRANCH_ARC = (Math.PI * 2) / 4
/** Pixels between tiers, measured outward from the centre. */
const TIER_SPACING = 110
/** Where tier 1 sits. Leaves the middle for the branch labels. */
const FIRST_TIER_RADIUS = 130

/**
 * Where each node sits, derived rather than authored.
 *
 * **Radial, because the game is an orrery.** Branches take a quadrant each and
 * tiers step outward, so investing in a branch reads as winding that arm of the
 * mechanism further out — and the shape needs no art direction to stay legible
 * as Phase 34 grows it from twelve nodes to seventy-two.
 *
 * Hand-placing coordinates in content was the alternative. It would look better
 * for twelve nodes and become a liability at seventy-two, where every insertion
 * means re-nudging its neighbours.
 */
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

    // Centre of this branch's quadrant, rotated so no branch sits on an axis —
    // an arm pointing straight up reads as "first" when none of them is.
    const centre = branchIndex * BRANCH_ARC + BRANCH_ARC / 2 - Math.PI / 2

    for (const [tier, tierNodes] of byTier) {
      const radius = FIRST_TIER_RADIUS + (tier - 1) * TIER_SPACING

      // Siblings share a tier and spread across the quadrant, narrowed so
      // neighbouring branches never touch.
      const usable = BRANCH_ARC * 0.7
      tierNodes.forEach((node, index) => {
        const offset =
          tierNodes.length === 1
            ? 0
            : (index / (tierNodes.length - 1) - 0.5) * usable
        const angle = centre + offset
        layout.push({
          nodeId: node.id,
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
          branch,
        })
      })
    }
  })

  return layout
}

/**
 * Whether the tree should be visible at all.
 *
 * economy-spec.md §3: **hidden entirely** until the first boss clear, because a
 * first-time player should meet exactly one progression system at a time.
 *
 * Two ways in, because the boss that gates it does not exist yet (Phase 32) and
 * a save that has already Rewound has plainly met the system:
 *
 * - any boss stage cleared, which is the authored condition; or
 * - a Rewind completed, which cannot happen before the tree is reachable but
 *   makes the gate robust to Phase 26 landing first.
 *
 * The consequence today is that the tree is unreachable on every save — there
 * is no boss and no Rewind. That is correct rather than broken: Recollection is
 * likewise unobtainable until Phase 26, so a visible tree would be a menu of
 * things nobody can buy.
 */
export function isTreeRevealed(save: SaveData): boolean {
  if (save.meta.rewindCount > 0) return true

  return save.meta.clearedStages.some((address) => {
    const { zoneId, stageId } = parseStageAddress(address)
    const stage = zoneById(zoneId)?.stages.find((s) => s.id === stageId)
    return stage ? isBossStage(stage.scalingIndex) : false
  })
}
