import { FILINGS, KEYS, RECOLLECTION } from '../content/economy'
import { isBossStage } from '../systems/scaling'
import { zoneById } from '../content/zones'
import { parseStageAddress, type StageAddress } from '../entities/Zone'
import type { SaveData } from '../core/saveSchema'

/**
 * Earning and spending.
 *
 * Three currencies with deliberately non-overlapping sources and sinks
 * (economy-spec.md §1) — if two ever bought the same thing, one would be
 * redundant:
 *
 * | | Source | Scope |
 * |---|---|---|
 * | **Filings** | Slack destroyed | this run only |
 * | **Recollection** | Rewinding | permanent |
 * | **Keys** | *First* clears | permanent |
 *
 * **Everything here is a pure function of the save plus its arguments.** The
 * simulation never reaches in; `core/bootstrap.ts` is the one place a tick's
 * events become a currency change. That keeps the economy testable without a
 * running field, and keeps `systems/` free of save-shaped state.
 */

/**
 * The slice of the Escapement Tree the economy cares about.
 *
 * Deliberately narrower than `UpgradeEffects`, which satisfies it structurally:
 * naming only the two fields that reach these formulas documents that nothing
 * else in the tree can quietly start affecting a drop rate.
 */
export interface TreeBonuses {
  filings: number
  recollection: number
}

export const NO_TREE_BONUSES: Readonly<TreeBonuses> = Object.freeze({
  filings: 0,
  recollection: 0,
})

/**
 * Filings from one Slack.
 *
 * Deliberately *not* rounded: rounding thousands of small drops compounds, the
 * same argument damage uses (CLAUDE.md, "Units"). The HUD rounds for display.
 */
export function filingsDrop(baseDrop: number, zoneIndex: number, tree = NO_TREE_BONUSES): number {
  return baseDrop * (1 + zoneIndex * FILINGS.zoneScaling) * (1 + tree.filings)
}

/** `base × growth^bought`, the shape every Filings sink shares. */
function sinkCost(curve: { base: number; growth: number }, bought: number): number {
  return Math.ceil(curve.base * curve.growth ** Math.max(0, bought))
}

export function slotCost(slotsUsed: number): number {
  return sinkCost(FILINGS.slot, slotsUsed)
}

export function mountCost(mountsUsed: number): number {
  return sinkCost(FILINGS.mount, mountsUsed)
}

/**
 * Cost of the next emergency repair.
 *
 * The Salvage discount is a fraction off, floored at one Filing — a free panic
 * button would stop being a panic button, which economy-spec invariant 6 is
 * explicitly about.
 */
export function repairCost(repairsThisStage: number, discount = 0): number {
  const full = sinkCost(FILINGS.repair, repairsThisStage)
  return Math.max(1, Math.ceil(full * (1 - Math.min(0.9, Math.max(0, discount)))))
}

export function reinforceCost(reinforcements: number): number {
  return sinkCost(FILINGS.reinforce, reinforcements)
}

/** What a reinforcement is worth, for the UI to quote before committing. */
export const REINFORCE_BONUS = FILINGS.reinforce.bonus

export function canAfford(save: SaveData, cost: number): boolean {
  return save.run.filings >= cost
}

/**
 * Spend Filings, or refuse.
 *
 * Returns false rather than throwing or clamping: a purchase the player cannot
 * afford is an ordinary UI state, not an error, and a partial spend would be
 * the worst of both.
 */
export function spendFilings(save: SaveData, cost: number): boolean {
  if (!canAfford(save, cost)) return false
  save.run.filings -= cost
  return true
}

/** Bank a drop, keeping the lifetime statistic in step. */
export function earnFilings(save: SaveData, amount: number): void {
  if (amount <= 0) return
  save.run.filings += amount
  save.statistics.totalFilingsEarned += amount
}

/**
 * Recollection for Rewinding now.
 *
 * Phase 26 owns the Rewind; this is the number it will quote and grant.
 */
export function recollectionFor(deepestScalingIndex: number, tree = NO_TREE_BONUSES): number {
  if (deepestScalingIndex <= 0) return 0
  const raw =
    deepestScalingIndex ** RECOLLECTION.depthExponent / RECOLLECTION.depthDivisor
  return Math.floor(raw * (1 + tree.recollection))
}

/**
 * The shallowest depth that awards anything.
 *
 * economy-spec.md §1 requires a **zero-award guard**: a Rewind that would grant
 * nothing must be blocked with an explanation, because a player must never be
 * able to burn a run for nothing. The UI needs a number to explain *with*, and
 * deriving it beats authoring a second constant that could drift from the
 * formula it describes.
 */
export function minimumRewindDepth(tree = NO_TREE_BONUSES): number {
  for (let depth = 1; depth <= 200; depth++) {
    if (recollectionFor(depth, tree) > 0) return depth
  }
  return Infinity
}

export interface ClearReward {
  keys: number
  /** True the first time this stage has ever been cleared. */
  firstClear: boolean
  /** True when this clear completed every stage in its zone. */
  zoneCompleted: boolean
}

/**
 * Keys for clearing a stage.
 *
 * **First clear only.** A re-clear awards zero, which is what stops Keys being
 * farmed and keeps the roster unlock curve authored rather than grindable.
 *
 * Pure: it reports what *would* be awarded. `applyStageClear` is what mutates.
 */
export function clearReward(save: SaveData, address: StageAddress): ClearReward {
  const none: ClearReward = { keys: KEYS.reclear, firstClear: false, zoneCompleted: false }
  if (save.meta.clearedStages.includes(address)) return none

  const { zoneId } = parseStageAddress(address)
  const zone = zoneById(zoneId)
  if (!zone) return none

  const stage = zone.stages.find((s) => `${zone.id}:${s.id}` === address)
  if (!stage) return none

  const keys = isBossStage(stage.scalingIndex)
    ? KEYS.bossStageFirstClear
    : KEYS.normalStageFirstClear

  // Zone completion counts this clear, which has not been recorded yet.
  const cleared = new Set(save.meta.clearedStages)
  cleared.add(address)
  const zoneCompleted = zone.stages.every((s) => cleared.has(`${zone.id}:${s.id}` as StageAddress))

  return {
    keys: keys + (zoneCompleted ? KEYS.zoneComplete : 0),
    firstClear: true,
    zoneCompleted,
  }
}

/**
 * Record a stage clear and grant its Keys.
 *
 * Idempotent by construction: the second call sees the address already in
 * `clearedStages` and awards nothing. A clear that fires twice — a double event,
 * a reload mid-transition — must not double-pay.
 */
export function applyStageClear(save: SaveData, address: StageAddress): ClearReward {
  const reward = clearReward(save, address)
  if (!reward.firstClear) return reward

  save.meta.clearedStages.push(address)
  save.meta.keys += reward.keys
  return reward
}

/**
 * Advance the run's depth marker, and the all-time one with it.
 *
 * `deepestScalingIndex` drives the Recollection award and resets on Rewind;
 * `deepestScalingIndexEver` is a statistic and does not.
 */
export function recordDepth(save: SaveData, scalingIndex: number): void {
  if (scalingIndex > save.run.deepestScalingIndex) {
    save.run.deepestScalingIndex = scalingIndex
  }
  if (scalingIndex > save.statistics.deepestScalingIndexEver) {
    save.statistics.deepestScalingIndexEver = scalingIndex
  }
}
