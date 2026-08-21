import type { AnyWaveDef, SpawnGroup, WaveDef } from '../entities/Wave'
import { isBossWave } from '../entities/Wave'
import { slackById } from '../content/enemies'
import { OVER_LEVEL, SCALING } from '../content/scaling'
import type { SimulationState } from '../core/simulation'

/**
 * The difficulty director.
 *
 * Two jobs, both from PLAN.md Phase 19: apply the authored wave curve, and say
 * where boss waves fall. The numbers all live in `content/scaling.ts`.
 *
 * **It never mutates content.** `sim.stage` is a live reference into
 * `content/zones.ts` and `readonly` is compile-time only — a Phase 17 tuning
 * harness wrote through that reference and produced a difficulty cliff that did
 * not exist. Everything here returns fresh objects, and a test asserts a full
 * directed stage leaves content byte-identical.
 */

/** Per-stage HP growth. economy-spec.md §5. */
export function scaleHp(base: number, scalingIndex: number, zoneMultiplier: number): number {
  return base * SCALING.enemyHpGrowth ** scalingIndex * zoneMultiplier
}

/** Per-stage damage growth. Slower than HP, so stalls precede walls. */
export function scaleDamage(base: number, scalingIndex: number, zoneMultiplier: number): number {
  return base * SCALING.enemyDamageGrowth ** scalingIndex * zoneMultiplier
}

/**
 * Per-stage count growth: `base + floor(stage / divisor)`.
 *
 * Authored in economy-spec.md §5 since Phase 6 and never implemented — enemy
 * counts came entirely from `zones.ts`. Applied per *group*, so a wave's shape
 * survives: a pincer gains a unit on each side rather than growing lopsided.
 */
export function scaledCount(base: number, scalingIndex: number): number {
  return base + Math.floor(scalingIndex / SCALING.enemyCountStageDivisor)
}

/** Boss stages fall every `bossInterval` stages. Content is Phase 32's. */
export function isBossStage(scalingIndex: number): boolean {
  return scalingIndex > 0 && scalingIndex % SCALING.bossInterval === 0
}

/** Stages until the next boss, counting the current one as 0 if it is one. */
export function stagesToNextBoss(scalingIndex: number): number {
  if (isBossStage(scalingIndex)) return 0
  const next = Math.ceil((scalingIndex + 1) / SCALING.bossInterval) * SCALING.bossInterval
  return next - scalingIndex
}

/**
 * A boss's stats: the stage curve, then the boss multipliers on top.
 *
 * Bosses **ignore the count formula** (economy-spec.md §5) — a boss stage is
 * one encounter, not a denser wave — so there is no `bossCount`. Phase 32 wires
 * these to `content/bosses.ts`; the trigger and the multipliers are settled
 * here so that phase inherits a boundary rather than inventing one.
 */
export function bossHp(base: number, scalingIndex: number, zoneMultiplier: number): number {
  return scaleHp(base, scalingIndex, zoneMultiplier) * SCALING.bossHpMultiplier
}

export function bossDamage(base: number, scalingIndex: number, zoneMultiplier: number): number {
  return scaleDamage(base, scalingIndex, zoneMultiplier) * SCALING.bossDamageMultiplier
}

/**
 * The player's sustained damage per second.
 *
 * Sustained, not burst: a Chime's output is gated by Charge (combat-spec.md §4),
 * so its rate is one shot per `chargeInterval` rather than one per
 * `baseInterval`. Counting its burst rate would read a Chime as several times
 * stronger than it plays, and the director would punish a build for owning one.
 *
 * Disabled units contribute nothing, which is correct — they are not fighting.
 * The Beat is excluded: it is the player's input, not their formation, and
 * scaling the wave against how well someone is playing is exactly the
 * rubber-banding `content/scaling.ts` argues against.
 */
export function formationPower(sim: SimulationState): number {
  let power = 0

  for (const movement of sim.movements) {
    if (movement.disabledFor > 0) continue
    const attack =
      movement.def.attack * movement.levelScale * (1 + movement.bonuses.attack)
    power += attack / movement.def.baseInterval
  }

  for (const chime of sim.chimes) {
    if (chime.disabledFor > 0) continue
    const attack = chime.def.attack * chime.levelScale * chime.attackScale
    // One shot per charge, one charge per chargeInterval.
    power += attack / chime.chargeInterval
  }

  return power
}

/**
 * The rate at which a wave delivers enemy HP, in HP per second.
 *
 * Deriving the yardstick from the wave itself is what lets over-level pressure
 * work without an authored power baseline. A baseline number would need
 * re-deriving every time the roster or the ring layout changed, and would rot
 * silently in between.
 */
export function waveHpRate(sim: SimulationState, wave: AnyWaveDef): number {
  if (isBossWave(wave)) return 0

  let totalHp = 0
  let duration = 0

  for (const group of wave.groups) {
    const def = slackById(group.defId)
    if (!def) continue

    const count = scaledCount(group.count, sim.stage.scalingIndex)
    totalHp += count * scaleHp(def.maxHp, sim.stage.scalingIndex, sim.zone.scalingMultiplier)
    duration = Math.max(duration, group.delay + group.interval * Math.max(0, count - 1))
  }

  // A wave that arrives all at once still takes a moment to fight.
  return totalHp / Math.max(1, duration)
}

/**
 * How far the formation outclasses the wave. 1.0 means it exactly keeps pace
 * with arrivals, which is already a comfortable clear.
 */
export function pressure(sim: SimulationState, wave: AnyWaveDef): number {
  const rate = waveHpRate(sim, wave)
  return rate <= 0 ? 0 : formationPower(sim) / rate
}

/**
 * Extra count, as a fraction of the authored count, for being over-levelled.
 *
 * One-sided by design: zero below the threshold, never negative. See
 * `content/scaling.ts` for why easing off would break the stall signal.
 */
export function overLevelBonus(sim: SimulationState, wave: AnyWaveDef): number {
  const excess = pressure(sim, wave) - OVER_LEVEL.threshold
  if (excess <= 0) return 0
  return Math.min(OVER_LEVEL.maxCountBonus, excess * OVER_LEVEL.countPerPressure)
}

/**
 * Produce the wave the stage will actually run.
 *
 * Called once when a wave begins and cached on the state, so `updateSpawning`,
 * `waveTotal` and `waveSpawnDuration` all read the same numbers. Recomputing
 * per tick would let the count drift as units died mid-wave, and a wave whose
 * total changes underneath the clear check never finishes.
 */
export function directWave(sim: SimulationState, wave: AnyWaveDef): AnyWaveDef {
  if (isBossWave(wave)) return wave

  const bonus = overLevelBonus(sim, wave)

  const groups: SpawnGroup[] = wave.groups.map((group) => {
    const base = scaledCount(group.count, sim.stage.scalingIndex)
    const count = Math.round(base * (1 + bonus))

    // Hold the group's duration rather than its interval, so adding enemies
    // makes a wave denser instead of longer. A wave that stretches to fit its
    // count would raise clear time without raising pressure, which is the
    // opposite of the intent.
    const duration = group.interval * Math.max(0, group.count - 1)
    const interval = count > 1 ? duration / (count - 1) : group.interval

    return { ...group, count, interval }
  })

  const directed: WaveDef = { ...wave, groups }
  return directed
}
