import type { StagePhase } from '../core/simulation'
import type { Simulation } from '../core/loop'
import { TARGET_FRAME_MS } from '../content/budgets'
import { timeToNextConjunction } from '../systems/synergy'
import { pairingOf, type TypePairing } from '../content/damageTypes'
import type { DamageType } from '../entities/types'
import type { UpgradeBranch } from '../entities/Upgrade'
import type { UnavailableReason } from '../progression/upgradeTree'
import type { ZoneView } from '../progression/map'
import { PooledDelta } from '../utils/delta'
import type { Settings } from '../core/saveSchema'
import type { ActionId } from '../content/keybindings'
import { DEFAULT_LOCALE } from '../i18n/locales'

export interface TreeNodeView {
  id: string
  name: string
  description: string
  branch: UpgradeBranch
  tier: number
  requires: readonly string[]
  cost: number
  purchased: boolean
  unlocked: boolean
  affordable: boolean
  blockedBy: UnavailableReason | null
  x: number
  y: number
  effects: readonly { kind: string; magnitude: number }[]
}

export interface TreeActions {
  purchase(nodeId: string): void
  respec(): void

  preview(nodeId: string): { ids: string[]; total: number; affordable: boolean }
}

export interface UnitProfileView {
  description: string
  role: string
  damageType: string
  targeting: string
  attack: number
  maxHp: number
  defence: number
  interval: number
  conjunction: { kind: string; magnitude: number } | null
}

export interface TutorialCardView {
  id: string
  name: string
  description: string

  key: string | null
}

export interface RosterView {
  kind: 'platform' | 'array'
  id: string
  name: string
  unlocked: boolean
  level: number
  unlockCost: number
  levelCost: number | null
  atMaxLevel: boolean
  canUnlock: boolean
  canLevel: boolean
  profile: UnitProfileView
}

export interface SlotView {
  ring: number
  slot: number
  defId: string
  name: string
  level: number
}

export interface SupportTrackView {
  track: string
  level: number
  maxLevel: number
  cost: number | null
  atMax: boolean
  affordable: boolean
}

export interface SupportUnitView {
  id: string
  name: string
  unlocked: boolean
  tracks: SupportTrackView[]
  stats: { maxCharge: number; chargeInterval: number; attack: number }
}

export interface RewindPreviewView {
  award: number
  after: number
  depth: number
  threshold: number
  canRewind: boolean
  refusedBecause: string | null
  resets: { salvage: number; platforms: number; arrays: number; stagesThisRun: number }
  keeps: { clearance: number; nodes: number; unlockedUnits: number; zones: number }
}

export interface PrestigeActions {
  rewind(): void
}

export interface SettingsActions {
  set<K extends keyof PlayerSettings>(key: K, value: PlayerSettings[K]): void
  bind(action: ActionId, binding: string): void
  resetBindings(): void

  beginRebind(action: ActionId | null): void

  exportSave(): string

  importSave(text: string): string | null
}

export type PlayerSettings = Omit<Settings, 'keybindings'>

export interface StageActions {
  standDown(): void

  begin(): void
}

export interface FormationActions {
  place(defId: string, ring: number, slot: number, from?: { ring: number; slot: number }): void
  remove(ring: number, slot: number): void
  mount(defId: string, mount: number): void
  unmount(mount: number): void
  unlock(kind: 'platform' | 'array', id: string): void
  buyTrack(defId: string, track: string): void
  levelUp(kind: 'platform' | 'array', id: string): void
  savePreset(name: string): void
  loadPreset(name: string): void
  deletePreset(name: string): void
}

export interface TelemetryRow {
  id: string
  dps: number
  share: number
  disables: number
}

export interface FormationSlotView {
  id: number
  ring: number
  slot: number
  name: string
  damageType: DamageType
  attackBonus: number
  defenceBonus: number
  rangeBonus: number
}

class GameStore {
  output = $state(0)
  maxOutput = $state(0)
  shield = $state(0)

  lowestOutputFraction = $state(1)
  repairsThisStage = $state(0)

  salvage = $state(0)

  recollection = $state(0)
  clearance = $state(0)

  salvageGain = $state(0)

  salvageLoss = $state(0)

  outputLoss = $state(0)

  outputGain = $state(0)

  private static readonly GAIN_WINDOW = 1.1
  private readonly salvagePool = new PooledDelta(GameStore.GAIN_WINDOW)
  private readonly outputPool = new PooledDelta(GameStore.GAIN_WINDOW)

  nextStageIn = $state(0)

  lastClearanceAward = $state<{ clearance: number; zoneCompleted: boolean } | null>(null)

  zoneId = $state('')
  zoneName = $state('')
  stageAddress = $state('')
  stageName = $state('')
  waveNumber = $state(0)
  waveCount = $state(0)
  phase = $state<StagePhase>('loading')

  contactCount = $state(0)
  projectilesLive = $state(0)
  platformCount = $state(0)
  arrayCount = $state(0)

  contactKilled = $state(0)
  conjunctions = $state(0)

  formation = $state<FormationSlotView[]>([])
  pairing = $state<TypePairing>('mixed')

  nextConjunctionAt = $state<number | null>(null)
  elapsed = $state(0)
  shieldedUnits = $state(0)
  hastedUnits = $state(0)

  private previewVersion = -1

  flareCharge = $state(0)
  flareMaxCharge = $state(0)
  flareCooldown = $state(0)
  flaresStruck = $state(0)

  fps = $state(0)
  frameMs = $state(0)
  simMs = $state(0)
  renderMs = $state(0)
  projectilePeak = $state(0)
  projectileExhausted = $state(0)
  contactPeak = $state(0)
  ticksOverBudget = $state(0)

  feedDropped = $state(0)

  telemetryRows = $state<TelemetryRow[]>([])
  private telemetryClock = 0

  showDiagnostics = $state(false)

  settings = $state<PlayerSettings>({
    masterVolume: 0.8,
    musicVolume: 0.6,
    sfxVolume: 0.8,
    screenShake: true,
    reducedMotion: false,
    colourblindPalette: 'none',
    textScale: 1,
    showFps: false,
    locale: DEFAULT_LOCALE,
  })

  keybindings = $state<Record<ActionId, string>>({} as Record<ActionId, string>)

  settingsActions = $state<SettingsActions | null>(null)

  rebinding = $state<ActionId | null>(null)

  systemReducedMotion = $state(false)

  showSettings = $state(false)

  showMenu = $state(false)

  stageActions = $state<StageActions | null>(null)

  manualRequested = $state(false)

  paused = $state(false)

  showFormation = $state(false)

  offlineSummary = $state<{
    elapsedSeconds: number
    effectiveSeconds: number
    wastedSeconds: number
    salvage: number
    capSeconds: number
    efficiency: number
    activeEquivalent: number
  } | null>(null)

  achievementQueue = $state<{ id: string; name: string; description: string }[]>([])

  tutorialQueue = $state<TutorialCardView[]>([])

  showPrestige = $state(false)
  rewindUnlocked = $state(false)
  rewindPreview = $state<RewindPreviewView | null>(null)
  prestigeActions = $state<PrestigeActions | null>(null)

  showMap = $state(false)
  map = $state<ZoneView[]>([])

  currentStage = $state<string | null>(null)

  requestedStage = $state<string | null>(null)

  showTree = $state(false)

  treeRevealed = $state(false)

  platformRoster = $state<RosterView[]>([])
  arrayRoster = $state<RosterView[]>([])
  fielded = $state<SlotView[]>([])
  mounted = $state<SlotView[]>([])
  nextSlotCost = $state(0)
  nextMountCost = $state(0)
  presetNames = $state<string[]>([])
  supportRoster = $state<SupportUnitView[]>([])
  formationActions = $state<FormationActions | null>(null)

  lastRefusal = $state<string | null>(null)

  tree = $state<TreeNodeView[]>([])
  treeRefund = $state(0)

  treeActions = $state<TreeActions | null>(null)

  outputFraction = $derived(this.maxOutput > 0 ? this.output / this.maxOutput : 0)

  clearedUntouched = $derived(this.phase === 'cleared' && this.lowestOutputFraction >= 1)

  standby = $derived(this.phase === 'standby')

  running = $derived(this.phase === 'wave-active' || this.phase === 'wave-gap')

  overFrameBudget = $derived(this.simMs + this.renderMs > TARGET_FRAME_MS)

  secondsToConjunction = $derived(
    this.nextConjunctionAt === null ? null : Math.max(0, this.nextConjunctionAt - this.elapsed),
  )

  flaresReady = $derived(Math.floor(this.flareCharge))
  canStrike = $derived(this.flaresReady >= 1 && this.flareCooldown <= 0 && this.running)

  flareProgress = $derived.by(() => {
    if (!this.running) return 0
    if (this.flaresReady >= 1) return 1
    return this.flareCharge - Math.floor(this.flareCharge)
  })

  syncFrom(simulation: Simulation): void {
    const sim = simulation.state

    if (sim.sun.maxHp !== this.maxOutput) this.outputPool.clear()
    this.outputPool.push(sim.sun.hp, sim.elapsed)
    this.outputLoss = this.outputPool.loss
    this.outputGain = this.outputPool.gain

    this.output = sim.sun.hp
    this.maxOutput = sim.sun.maxHp
    this.shield = sim.sun.shield
    this.lowestOutputFraction = sim.sun.lowestFraction
    this.repairsThisStage = sim.sun.repairsThisStage

    this.zoneId = sim.zone.id
    this.zoneName = sim.zone.name
    this.stageAddress = `${sim.zone.id}:${sim.stage.id}`
    this.stageName = sim.stage.name
    this.waveNumber = sim.waveIndex + 1
    this.waveCount = sim.stage.waves.length
    this.phase = sim.phase

    this.contactCount = sim.contact.length
    this.projectilesLive = simulation.projectiles.live
    this.platformCount = sim.platforms.length
    this.arrayCount = sim.arrays.length

    this.contactKilled = simulation.totalContactKilled
    this.conjunctions = simulation.totalConjunctions

    this.projectilePeak = simulation.projectiles.peak
    this.projectileExhausted = simulation.projectiles.exhausted
    this.contactPeak = simulation.peakContact
    this.ticksOverBudget = simulation.ticksOverContactBudget
    this.feedDropped = sim.feed.dropped

    this.elapsed = sim.elapsed
    this.syncFormation(simulation)
    this.syncTelemetry(simulation)

    this.flareCharge = sim.flare.charge
    this.flareMaxCharge = sim.flare.maxCharge
    this.flareCooldown = sim.flare.cooldown
    this.flaresStruck = sim.flare.struck
  }

  private syncFormation(simulation: Simulation): void {
    const sim = simulation.state

    let shielded = 0
    let hasted = 0
    for (const m of sim.platforms) {
      if (m.buffs.shield.magnitude > 0) shielded++
      if (m.buffs.haste.magnitude > 0) hasted++
    }
    this.shieldedUnits = shielded
    this.hastedUnits = hasted

    const changed = this.previewVersion !== sim.formationVersion
    const elapsedPast = this.nextConjunctionAt !== null && sim.elapsed >= this.nextConjunctionAt
    if (!changed && !elapsedPast) return

    this.previewVersion = sim.formationVersion

    if (changed) {
      this.formation = sim.platforms.map((m) => ({
        id: m.id,
        ring: m.slot.ring,
        slot: m.slot.slot,
        name: m.def.name,
        damageType: m.def.damageType,
        attackBonus: m.bonuses.attack,
        defenceBonus: m.bonuses.defence,
        rangeBonus: m.bonuses.range,
      }))
      this.pairing = pairingOf(sim.platforms.map((m) => m.def.damageType))
    }

    const seconds = timeToNextConjunction(sim, 120 + sim.effects.previewHorizon)
    this.nextConjunctionAt = seconds === null ? null : sim.elapsed + seconds
  }

  primeSalvage(balance: number): void {
    this.salvage = balance
    this.salvagePool.prime(balance)
    this.salvageGain = 0
    this.salvageLoss = 0
  }

  publishSalvage(balance: number, elapsed: number): void {
    this.salvagePool.push(balance, elapsed)
    this.salvage = balance
    this.salvageGain = this.salvagePool.gain
    this.salvageLoss = this.salvagePool.loss
  }

  private syncTelemetry(simulation: Simulation): void {
    const telemetry = simulation.state.telemetry
    if (!telemetry) return

    if (telemetry.elapsed - this.telemetryClock < 1) return
    this.telemetryClock = telemetry.elapsed

    this.telemetryRows = telemetry
      .ranked()

      .filter((row) => row.share > 0)
      .slice(0, 8)
      .map((row) => ({
        id: row.id,
        dps: row.dps,
        share: row.share,
        disables: row.stats.disables,
      }))
  }

  reset(): void {
    this.contactKilled = 0
    this.conjunctions = 0
    this.phase = 'loading'

    this.lastClearanceAward = null
    this.nextStageIn = 0
    this.salvageGain = 0
    this.salvageLoss = 0

    this.outputPool.clear()
    this.outputLoss = 0
    this.outputGain = 0
  }
}

export const game = new GameStore()
