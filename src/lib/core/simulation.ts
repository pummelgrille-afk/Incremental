import type { ChimeInstance } from '../entities/Chime'
import type { MainspringState } from '../entities/Mainspring'
import type { MovementInstance } from '../entities/Movement'
import type { Projectile } from '../entities/Projectile'
import type { SlackInstance } from '../entities/Slack'
import type { StageDef, ZoneDef } from '../entities/Zone'
import { BEAT, RINGS } from '../content/field'
import type { CombatFeed } from '../systems/feed'

/**
 * The complete mutable state of one loaded stage.
 *
 * Plain data. Imports no framework — see docs/architecture.md, "Layer
 * boundaries". Systems mutate this in the order fixed by combat-spec.md §8;
 * stores/ publishes a projection of it once per tick, and render.ts reads it
 * without ever writing back.
 */

export interface RingState {
  /** Radians. The only per-ring mutable value — units derive angles from it. */
  phase: number
  /** Radians per second. Constant; nothing in the game changes it. */
  angularVelocity: number
}

/**
 * The Wright's manual strike. combat-spec.md §1.
 *
 * Lives on the simulation rather than the UI because charge regenerates on
 * simulation time, so it keeps accruing at the same rate regardless of frame
 * rate and stops accruing when the stage is over.
 */
export interface BeatState {
  /** Fractional so regeneration is smooth; floor before spending. */
  charge: number
  maxCharge: number
  /** Seconds until another strike is allowed. */
  cooldown: number
  /** Cumulative, for statistics and achievements. */
  struck: number
}

export type StagePhase =
  | 'loading'
  | 'wave-active'
  /** Between waves — the player's re-slotting window. */
  | 'wave-gap'
  | 'cleared'
  | 'overwhelmed'

export interface SimulationState {
  readonly zone: ZoneDef
  readonly stage: StageDef

  phase: StagePhase
  /** Seconds since the stage loaded. Drives spawn schedules. */
  elapsed: number

  waveIndex: number
  /** Seconds since the current wave began. */
  waveElapsed: number
  /**
   * Radians the current wave's arcs are rotated by.
   *
   * Rerolled per wave so a `pincer` is not always on the same axis. The *shape*
   * is the question the wave asks and must survive; only its bearing moves.
   */
  waveArcOffset: number
  /**
   * Bumped on every formation change. The synergy preview is far too expensive
   * to recompute per frame, so `stores/` watches this instead of diffing the
   * formation itself.
   */
  formationVersion: number
  /** Counts down during 'wave-gap'. */
  gapRemaining: number

  mainspring: MainspringState
  rings: RingState[]
  beat: BeatState

  /** Transient presentation events. Never read by the simulation itself. */
  feed: CombatFeed

  movements: MovementInstance[]
  chimes: ChimeInstance[]
  slack: SlackInstance[]
  /** Pooled and mostly inactive; always filter on `active`. */
  projectiles: Projectile[]

  /** Filings banked this stage. Added to the run total on clear. */
  filingsEarned: number

  /** Milliseconds owed to the synergy pass, which runs at 100 ms not per tick. */
  synergyAccumulator: number

  /** Monotonic; never reused within a stage. */
  nextEntityId: number
}

export function createRingStates(): RingState[] {
  return RINGS.map((ring) => ({
    phase: 0,
    angularVelocity: (Math.PI * 2) / ring.period,
  }))
}

export function createBeatState(maxCharge = BEAT.maxCharges): BeatState {
  return { charge: maxCharge, maxCharge, cooldown: 0, struck: 0 }
}

export function allocateId(sim: SimulationState): number {
  return sim.nextEntityId++
}

/** The stage-clear condition: last wave finished with Tension remaining. */
export function isCleared(sim: SimulationState): boolean {
  return sim.phase === 'cleared'
}
