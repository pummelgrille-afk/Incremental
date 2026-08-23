import type { ArrayInstance } from '../entities/Array'
import type { SunState } from '../entities/Sun'
import type { PlatformInstance } from '../entities/Platform'
import type { Projectile } from '../entities/Projectile'
import type { ContactInstance } from '../entities/Contact'
import type { BossRuntime } from '../entities/Boss'
import type { StageDef, ZoneDef } from '../entities/Zone'
import type { AnyWaveDef } from '../entities/Wave'
import { FLARE, RINGS } from '../content/field'
import type { CombatFeed } from '../systems/feed'
import type { TracerFeed } from '../systems/tracers'
import type { ParticleField } from '../systems/particles'
import type { Telemetry } from '../systems/telemetry'
import type { UpgradeEffects } from '../entities/Upgrade'

export interface RingState {
  phase: number

  angularVelocity: number
}

export interface FlareState {
  charge: number
  maxCharge: number

  cooldown: number

  struck: number
}

export type StagePhase =
  | 'loading'
  | 'wave-active'

  | 'wave-gap'

  | 'standby'
  | 'cleared'
  | 'overwhelmed'

export interface SimulationState {
  readonly zone: ZoneDef
  readonly stage: StageDef

  phase: StagePhase

  elapsed: number

  waveIndex: number

  waveElapsed: number

  waveArcOffset: number

  formationVersion: number

  activeWave: AnyWaveDef | null

  telemetry: Telemetry | null

  effects: UpgradeEffects

  gapRemaining: number

  sun: SunState
  rings: RingState[]
  flare: FlareState

  feed: CombatFeed

  tracers: TracerFeed

  particles: ParticleField

  platforms: PlatformInstance[]
  arrays: ArrayInstance[]
  contact: ContactInstance[]

  boss: BossRuntime | null

  bossSpawnedFor: number

  projectiles: Projectile[]

  salvageEarned: number

  synergyAccumulator: number

  nextEntityId: number
}

export function createRingStates(): RingState[] {
  return RINGS.map((ring) => ({
    phase: 0,
    angularVelocity: (Math.PI * 2) / ring.period,
  }))
}

export function createFlareState(maxCharge: number = FLARE.maxCharges): FlareState {
  return { charge: maxCharge, maxCharge, cooldown: 0, struck: 0 }
}

export function allocateId(sim: SimulationState): number {
  return sim.nextEntityId++
}

export function isCleared(sim: SimulationState): boolean {
  return sim.phase === 'cleared'
}
