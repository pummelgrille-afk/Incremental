import {
  noUpgradeEffects,
  UPGRADE_BRANCHES,
  type UpgradeBranch,
  type UpgradeEffects,
  type UpgradeNodeDef,
} from '../entities/Upgrade'
import { UPGRADE_NODES, upgradeById } from '../content/upgrades'
import { TREE } from '../content/economy'
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
