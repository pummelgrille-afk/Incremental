import { SALVAGE, CLEARANCE, RECOLLECTION } from '../content/economy'
import { isBossStage } from '../systems/scaling'
import { zoneById } from '../content/zones'
import { bossById } from '../content/bosses'
import { unlockReachableZones } from './map'
import { isBossWave } from '../entities/Wave'
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
 * | **Salvage** | Contact destroyed | this run only |
 * | **Recollection** | Rewinding | permanent |
 * | **Clearance** | *First* clears | permanent |
 *
 * **Everything here is a pure function of the save plus its arguments.** The
 * simulation never reaches in; `core/bootstrap.ts` is the one place a tick's
 * events become a currency change. That keeps the economy testable without a
 * running field, and keeps `systems/` free of save-shaped state.
 */

/**
 * The slice of the Almanac the economy cares about.
 *
 * Deliberately narrower than `UpgradeEffects`, which satisfies it structurally:
 * naming only the two fields that reach these formulas documents that nothing
 * else in the tree can quietly start affecting a drop rate.
 */
export interface TreeBonuses {
  salvage: number
  recollection: number
}

export const NO_TREE_BONUSES: Readonly<TreeBonuses> = Object.freeze({
  salvage: 0,
  recollection: 0,
})

/**
 * Salvage from one Contact.
 *
 * Deliberately *not* rounded: rounding thousands of small drops compounds, the
 * same argument damage uses (CLAUDE.md, "Units"). The HUD rounds for display.
 */
export function salvageDrop(baseDrop: number, zoneIndex: number, tree = NO_TREE_BONUSES): number {
  return baseDrop * (1 + zoneIndex * SALVAGE.zoneScaling) * (1 + tree.salvage)
}

/** `base × growth^bought`, the shape every Salvage sink shares. */
function sinkCost(curve: { base: number; growth: number }, bought: number): number {
  return Math.ceil(curve.base * curve.growth ** Math.max(0, bought))
}

export function slotCost(slotsUsed: number): number {
  return sinkCost(SALVAGE.slot, slotsUsed)
}

export function mountCost(mountsUsed: number): number {
  return sinkCost(SALVAGE.mount, mountsUsed)
}

/**
 * Cost of the next emergency repair.
 *
 * The Recovery discount is a fraction off, floored at one Filing — a free panic
 * button would stop being a panic button, which economy-spec invariant 6 is
 * explicitly about.
 */
export function repairCost(repairsThisStage: number, discount = 0): number {
  const full = sinkCost(SALVAGE.repair, repairsThisStage)
  return Math.max(1, Math.ceil(full * (1 - Math.min(0.9, Math.max(0, discount)))))
}

export function reinforceCost(reinforcements: number): number {
  return sinkCost(SALVAGE.reinforce, reinforcements)
}

/** What a reinforcement is worth, for the UI to quote before committing. */
export const REINFORCE_BONUS = SALVAGE.reinforce.bonus

export function canAfford(save: SaveData, cost: number): boolean {
  return save.run.salvage >= cost
}

/**
 * Spend Salvage, or refuse.
 *
 * Returns false rather than throwing or clamping: a purchase the player cannot
 * afford is an ordinary UI state, not an error, and a partial spend would be
 * the worst of both.
 */
export function spendSalvage(save: SaveData, cost: number): boolean {
  if (!canAfford(save, cost)) return false
  save.run.salvage -= cost
  return true
}

/** Bank a drop, keeping the lifetime statistic in step. */
export function earnSalvage(save: SaveData, amount: number): void {
  if (amount <= 0) return
  save.run.salvage += amount
  save.statistics.totalSalvageEarned += amount
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
 * deriving it flares authoring a second constant that could drift from the
 * formula it describes.
 */
export function minimumRewindDepth(tree = NO_TREE_BONUSES): number {
  for (let depth = 1; depth <= 200; depth++) {
    if (recollectionFor(depth, tree) > 0) return depth
  }
  return Infinity
}

export interface ClearReward {
  clearance: number
  /** True the first time this stage has ever been cleared. */
  firstClear: boolean
  /** True when this clear completed every stage in its zone. */
  zoneCompleted: boolean
  /**
   * A boss's one-off Salvage bounty, or 0.
   *
   * Salvage rather than Clearance because the two currencies answer different
   * questions (economy-spec.md §1): Clearance measures content *seen* and is
   * already paid at 5 for any boss stage, while a bounty is a reward for the
   * fight itself and belongs to the run it was won in. Paying a boss in
   * Clearance instead would make roster breadth depend on beating bosses rather
   * than on reaching them, which is a harder gate than the curve is authored
   * for.
   *
   * First clear only, like everything else here — a farmable boss would make
   * the whole Salvage economy a function of one repeatable encounter.
   */
  bossSalvage: number

  /**
   * Zone ids this clear opened, if any.
   *
   * Always empty from `clearReward`, which reports rather than mutates —
   * populated only by `applyStageClear`.
   */
  unlockedZones: string[]
}

/**
 * Clearance for clearing a stage.
 *
 * **First clear only.** A re-clear awards zero, which is what stops Clearance being
 * farmed and keeps the roster unlock curve authored rather than grindable.
 *
 * Pure: it reports what *would* be awarded. `applyStageClear` is what mutates.
 */
export function clearReward(save: SaveData, address: StageAddress): ClearReward {
  const none: ClearReward = {
    clearance: CLEARANCE.reclear,
    firstClear: false,
    zoneCompleted: false,
    bossSalvage: 0,
    unlockedZones: [],
  }
  if (save.meta.clearedStages.includes(address)) return none

  const { zoneId } = parseStageAddress(address)
  const zone = zoneById(zoneId)
  if (!zone) return none

  const stage = zone.stages.find((s) => `${zone.id}:${s.id}` === address)
  if (!stage) return none

  const clearance = isBossStage(stage.scalingIndex)
    ? CLEARANCE.bossStageFirstClear
    : CLEARANCE.normalStageFirstClear

  // Zone completion counts this clear, which has not been recorded yet.
  const cleared = new Set(save.meta.clearedStages)
  cleared.add(address)
  const zoneCompleted = zone.stages.every((s) => cleared.has(`${zone.id}:${s.id}` as StageAddress))

  // Every boss the stage fields, summed — a stage with two would pay for both,
  // though nothing authors one and stageLoader would have to allow it first.
  let bossSalvage = 0
  for (const wave of stage.waves) {
    if (!isBossWave(wave)) continue
    bossSalvage += bossById(wave.bossId)?.firstClearSalvage ?? 0
  }

  return {
    clearance: clearance + (zoneCompleted ? CLEARANCE.zoneComplete : 0),
    firstClear: true,
    zoneCompleted,
    bossSalvage,
    unlockedZones: [],
  }
}

/**
 * Record a stage clear and grant its Clearance.
 *
 * Idempotent by construction: the second call sees the address already in
 * `clearedStages` and awards nothing. A clear that fires twice — a double event,
 * a reload mid-transition — must not double-pay.
 */
export function applyStageClear(save: SaveData, address: StageAddress): ClearReward {
  const reward = clearReward(save, address)
  if (!reward.firstClear) return reward

  save.meta.clearedStages.push(address)
  save.meta.clearance += reward.clearance
  // Into the run's balance, not into meta: a bounty is won in a run and a
  // Rewind takes it with everything else.
  save.run.salvage += reward.bossSalvage

  /*
   * Open whatever this clear made reachable.
   *
   * Here rather than in the caller because a zone unlock is part of what a
   * clear *is*: `meta.unlockedZones` and `ZoneDef.requires` both existed from
   * Phase 8 and nothing ever wrote to the first, so every zone past the
   * starting one was unreachable. Nothing noticed, because until Phase 33 there
   * was no second zone.
   */
  reward.unlockedZones = unlockReachableZones(save)
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
