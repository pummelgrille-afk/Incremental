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

/**
 * The Almanac, projected for the view.
 *
 * The tree reads the **save**, not the simulation, so it cannot ride on
 * `syncFrom`. `bootstrap.ts` pushes it whenever a purchase changes it, and the
 * component calls back through `treeActions` to spend — keeping `stores/` the
 * only bridge in both directions.
 */
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
  /** What reaching a node costs, prerequisites included. */
  preview(nodeId: string): { ids: string[]; total: number; affordable: boolean }
}

/**
 * What a unit is and does, for the roster panel's hover card.
 *
 * Mirrors `progression/roster.ts`'s `UnitProfile` rather than importing it —
 * `stores/` is the bridge into Svelte and does not depend on `progression/`,
 * the same rule that keeps `SupportTrackView.track` a plain string.
 */
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

/**
 * One onboarding card, projected for the view.
 *
 * Mirrors `TutorialStepDef` rather than importing it, the same rule that keeps
 * `SupportTrackView.track` a plain string: `stores/` is the bridge into Svelte
 * and does not depend on `content/` or `progression/`.
 */
export interface TutorialCardView {
  id: string
  name: string
  description: string
  /** The key that opens what the card is about, or null. */
  key: string | null
}

/** A unit in the roster panel. */
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

/** One occupied ring slot or rim mount. */
export interface SlotView {
  ring: number
  slot: number
  defId: string
  name: string
  level: number
}

/** A Array's upgrade tracks, for the editor. */
export interface SupportTrackView {
  /** The track's id. The editor translates it; this layer does not name it. */
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

/**
 * Everything the settings screen can change, and how.
 *
 * A command interface rather than writable state on the store, for the reason
 * `stores/` exists at all: the save is owned by `bootstrap.ts`, and a setting
 * that a component could write directly would be a setting that could get out
 * of step with the file it is supposed to live in. The component asks; the
 * owner applies, persists and republishes.
 */
export interface SettingsActions {
  set<K extends keyof PlayerSettings>(key: K, value: PlayerSettings[K]): void
  bind(action: ActionId, binding: string): void
  resetBindings(): void
  /**
   * Start or cancel waiting for a key.
   *
   * The capture has to beat the global key handler, and the global handler
   * lives in `bootstrap.ts` — so the settings screen asks for a rebind rather
   * than listening for one itself. A component that installed its own window
   * listener would race the one that opens the formation editor on F.
   */
  beginRebind(action: ActionId | null): void
  /** The save as a transferable string, for the menu's export. */
  exportSave(): string
  /** Replaces everything. Returns a problem to show, or null on success. */
  importSave(text: string): string | null
}

/** The settings a player can change, projected. `keybindings` is separate. */
export type PlayerSettings = Omit<Settings, 'keybindings'>

/**
 * Starting and stopping the shift.
 *
 * Both go through `bootstrap.ts` rather than being flags the view can set,
 * because both rebuild the simulation and only the session owns that.
 */
export interface StageActions {
  /**
   * Stop the stage and hold the field.
   *
   * Rebuilds the stage from the start and parks it, so re-entering begins
   * cleanly rather than dropping the player back into a half-finished wave with
   * the Contacts gone. It also cancels any queued advance to the next stage.
   */
  standDown(): void
  /** Start, or restart, the loaded stage. */
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

/** One row of the dev-only telemetry readout. */
export interface TelemetryRow {
  id: string
  dps: number
  share: number
  disables: number
}

/** One row of the synergy preview. Rebuilt on formation change, never per frame. */
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

/**
 * The reactive projection of simulation state.
 *
 * This is the **only** bridge into Svelte (docs/architecture.md). The
 * simulation itself is plain TypeScript holding thousands of mutable fields;
 * running that through runes would defeat the point of ADR-001.
 *
 * What crosses this boundary is a couple of dozen scalars, written once per
 * frame at step 11 of the tick order. Components read these; nothing reads a
 * SimulationState directly.
 */
class GameStore {
  // Objective
  output = $state(0)
  maxOutput = $state(0)
  shield = $state(0)
  /** Lowest Output fraction reached this stage. Drives "cleared untouched". */
  lowestOutputFraction = $state(1)
  repairsThisStage = $state(0)

  // Economy
  salvage = $state(0)
  /** Permanent currencies. Unchanged by anything the field does. */
  recollection = $state(0)
  clearance = $state(0)

  /**
   * Recent movement in Salvage and in Output, pooled for the HUD's readouts.
   *
   * Pooled rather than per-event: kills arrive dozens a second and hits on the
   * Sun at a comparable rate, so an animation each would strobe. The rule lives
   * in `utils/delta.ts`; these are the two runes it is mirrored into.
   *
   * Mirrored here rather than read through a `$derived` because a `PooledDelta`
   * is a plain object — Svelte cannot see a mutation inside one, and making it
   * reactive would put a rune underneath arithmetic that has to stay testable
   * without a DOM. `syncFrom` already runs exactly once a frame, so the mirror
   * costs one comparison per field.
   */
  salvageGain = $state(0)
  /** Recent spending. A purchase is movement too, and reads as one. */
  salvageLoss = $state(0)
  /** Output lost in the last second. The one number a player under fire needs. */
  outputLoss = $state(0)
  /** Output regained — a repair, or the Recovery branch doing its job. */
  outputGain = $state(0)

  private static readonly GAIN_WINDOW = 1.1
  private readonly salvagePool = new PooledDelta(GameStore.GAIN_WINDOW)
  private readonly outputPool = new PooledDelta(GameStore.GAIN_WINDOW)

  /**
   * Seconds until the next stage loads, or 0 when nothing is queued.
   *
   * Interim, until Phase 33's stage-select. It exists so the clear banner can
   * say what happens next instead of leaving the field stopped with no
   * explanation, which is exactly how it read before.
   */
  nextStageIn = $state(0)

  /** Set once when a stage clear pays Clearance. The HUD clears it after showing. */
  lastClearanceAward = $state<{ clearance: number; zoneCompleted: boolean } | null>(null)

  /*
   * Stage progress.
   *
   * The ids ride along beside the names from Phase 44: a name is the *English*
   * one authored in `content/`, and the id is what a translation is keyed on.
   * The HUD needs both — the id to look a translation up, the name as the
   * fallback when a language has not translated the content.
   */
  zoneId = $state('')
  zoneName = $state('')
  stageAddress = $state('')
  stageName = $state('')
  waveNumber = $state(0)
  waveCount = $state(0)
  phase = $state<StagePhase>('loading')

  // Field
  contactCount = $state(0)
  projectilesLive = $state(0)
  platformCount = $state(0)
  arrayCount = $state(0)

  // Session counters
  contactKilled = $state(0)
  conjunctions = $state(0)

  // Synergy preview — combat-spec.md §3 makes this a hard requirement.
  formation = $state<FormationSlotView[]>([])
  pairing = $state<TypePairing>('mixed')
  /** Simulation time the next conjunction lands, or null if none is coming. */
  nextConjunctionAt = $state<number | null>(null)
  elapsed = $state(0)
  shieldedUnits = $state(0)
  hastedUnits = $state(0)

  /** Version the preview was last built for. Not reactive; a plain field. */
  private previewVersion = -1

  // The Flare — the only live input
  flareCharge = $state(0)
  flareMaxCharge = $state(0)
  flareCooldown = $state(0)
  flaresStruck = $state(0)

  // Performance, shown when settings.showFps is on
  fps = $state(0)
  frameMs = $state(0)
  simMs = $state(0)
  renderMs = $state(0)
  projectilePeak = $state(0)
  projectileExhausted = $state(0)
  contactPeak = $state(0)
  ticksOverBudget = $state(0)
  /** Popups discarded because the feed was full. Legibility signal, not an error. */
  feedDropped = $state(0)

  /**
   * Dev-only DPS-per-source readout, refreshed about once a second.
   *
   * Rebuilding it per frame would allocate a sorted array sixty times a second
   * to show numbers that move far slower than that. Empty in a production
   * build, where the collector does not exist.
   */
  telemetryRows = $state<TelemetryRow[]>([])
  private telemetryClock = 0

  /** Mirrors settings.showFps. Toggled with F2, persisted to the save. */
  showDiagnostics = $state(false)

  /**
   * The player's settings, mirrored out of the save.
   *
   * Read by the settings screen, and by `App.svelte` for the two that are
   * applied to the document rather than to the field — text scale and reduced
   * motion. Everything else is applied by `bootstrap.ts`, which owns the save.
   */
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

  /** Action id → binding. Mirrored out of the save alongside `settings`. */
  keybindings = $state<Record<ActionId, string>>({} as Record<ActionId, string>)

  settingsActions = $state<SettingsActions | null>(null)

  /** The action waiting for a key, or null. Owned by bootstrap's handler. */
  rebinding = $state<ActionId | null>(null)

  /**
   * The operating system has asked for reduced motion.
   *
   * Published so the settings screen can explain why the toggle looks stuck on.
   * A preference set at the OS level is an answer already given; the in-game
   * toggle can add a reason to reduce, never remove that one.
   */
  systemReducedMotion = $state(false)

  /** The settings screen. Deliberately not persisted. */
  showSettings = $state(false)

  /** The system menu — Escape. Pauses the run while it is open. */
  showMenu = $state(false)

  stageActions = $state<StageActions | null>(null)

  /**
   * The sidebar asking for the Manual.
   *
   * A request rather than a call, the same way `requestedStage` is: opening the
   * Manual reads the save and plays a cue, and the store is a projection that
   * must not reach into either. `bootstrap.ts` consumes it and clears it.
   */
  manualRequested = $state(false)

  /**
   * Whether simulated time is advancing.
   *
   * Not the same as "a panel is open". Every other screen in this game leaves
   * the field running, because P1 says the machine runs without you and a
   * player who opens the Almanac has not asked the Approach to wait. A pause is
   * the one case where they have asked, explicitly.
   */
  paused = $state(false)

  /** The synergy preview panel. Toggled with F; deliberately not persisted. */
  showFormation = $state(false)

  /**
   * What accrued while the player was away, or null when nothing did.
   *
   * Cleared by the summary once it has been read — it reports one absence, not
   * a running total.
   */
  offlineSummary = $state<{
    elapsedSeconds: number
    effectiveSeconds: number
    wastedSeconds: number
    salvage: number
    capSeconds: number
    efficiency: number
    activeEquivalent: number
  } | null>(null)

  /**
   * Achievements earned but not yet shown.
   *
   * A queue rather than a single slot: several can land on the same tick — a
   * first clear that was also untouched — and a toast replacing its
   * predecessor would swallow one.
   */
  achievementQueue = $state<{ id: string; name: string; description: string }[]>([])

  /**
   * Onboarding cards waiting to be read.
   *
   * A queue for the same reason the achievement one is: `progression/tutorial`
   * shows at most one card per moment, but two moments can land close enough
   * together — a conjunction firing on the tick a stage clears — that a single
   * slot would silently drop one. A card nobody read is a step the player was
   * charged for and never got.
   */
  tutorialQueue = $state<TutorialCardView[]>([])

  /** The Rewind modal. Toggled with P, once unlocked. */
  showPrestige = $state(false)
  rewindUnlocked = $state(false)
  rewindPreview = $state<RewindPreviewView | null>(null)
  prestigeActions = $state<PrestigeActions | null>(null)

  /**
   * The progression map. Toggled with M.
   *
   * `map` is projected from progression/map.ts rather than assembled here:
   * which stages are enterable is a rule, and a rule living in a store or a
   * template is a rule nothing can test.
   */
  showMap = $state(false)
  map = $state<ZoneView[]>([])
  /** Address of the stage in play, so the map can mark it. */
  currentStage = $state<string | null>(null)
  /**
   * Set by the map when the player picks a stage; bootstrap consumes it and
   * clears it. A request rather than a call, because the store is a projection
   * and must not reach into the simulation.
   */
  requestedStage = $state<string | null>(null)

  /** The Almanac view. Toggled with T, once revealed. */
  showTree = $state(false)
  /** Hidden entirely until the first boss clear — economy-spec.md §3. */
  treeRevealed = $state(false)

  // The roster and the fielded formation. Pushed by bootstrap on change.
  platformRoster = $state<RosterView[]>([])
  arrayRoster = $state<RosterView[]>([])
  fielded = $state<SlotView[]>([])
  mounted = $state<SlotView[]>([])
  nextSlotCost = $state(0)
  nextMountCost = $state(0)
  presetNames = $state<string[]>([])
  supportRoster = $state<SupportUnitView[]>([])
  formationActions = $state<FormationActions | null>(null)
  /** Last refusal, so the editor can say why rather than doing nothing. */
  lastRefusal = $state<string | null>(null)

  // The tree. Pushed by bootstrap on change, not read per frame.
  tree = $state<TreeNodeView[]>([])
  treeRefund = $state(0)
  /** Installed by bootstrap. Null until the session exists. */
  treeActions = $state<TreeActions | null>(null)

  outputFraction = $derived(this.maxOutput > 0 ? this.output / this.maxOutput : 0)

  /** Cleared without taking a single hit — the "Within Tolerance" condition. */
  clearedUntouched = $derived(this.phase === 'cleared' && this.lowestOutputFraction >= 1)

  /** True while the player can act — used to gate input and dim the field. */
  /** Stood down: a stage is loaded and deliberately not running. */
  standby = $derived(this.phase === 'standby')

  running = $derived(this.phase === 'wave-active' || this.phase === 'wave-gap')

  /** True when the frame budget is at risk — drives the diagnostics warning. */
  overFrameBudget = $derived(this.simMs + this.renderMs > TARGET_FRAME_MS)

  /**
   * Seconds until the next conjunction, counting down.
   *
   * Derived from an absolute time rather than stored as a remaining duration —
   * the rings keep turning between recomputes, so a stored countdown would go
   * stale the moment it was written.
   */
  secondsToConjunction = $derived(
    this.nextConjunctionAt === null ? null : Math.max(0, this.nextConjunctionAt - this.elapsed),
  )

  /** Whole charges available. Fractional regeneration is not spendable. */
  flaresReady = $derived(Math.floor(this.flareCharge))
  canStrike = $derived(this.flaresReady >= 1 && this.flareCooldown <= 0 && this.running)

  /**
   * Progress toward the next moment the Flare can be struck, 0–1.
   *
   * Full whenever a whole charge is banked, otherwise the fraction of the next
   * one that has regenerated.
   *
   * **The 0.25 s cooldown is deliberately not shown.** It is a guard so a
   * double-click cannot waste a charge (`content/field.ts`), not something the
   * player waits on, and reporting it made the bar useless: after a strike it
   * raced from empty to full in a quarter of a second and then dropped to the
   * real charge fraction. All motion, no information.
   *
   * Keying on whole charges rather than on `canStrike` also keeps the bar still
   * during that cooldown when charges remain — otherwise it would dip and
   * recover every single strike.
   */
  flareProgress = $derived.by(() => {
    // A resolved stage refuses strikes whatever the charge, so a full bar there
    // would advertise an input that does nothing.
    if (!this.running) return 0
    if (this.flaresReady >= 1) return 1
    return this.flareCharge - Math.floor(this.flareCharge)
  })

  /**
   * Copy the scalars out of the simulation. Called once per rendered frame.
   *
   * Deliberately a flat sequence of assignments: Svelte 5 skips writes that do
   * not change the value, so a field that has not moved costs a comparison and
   * nothing more.
   */
  syncFrom(simulation: Simulation): void {
    const sim = simulation.state

    /*
     * Output movement, pooled before it is published.
     *
     * A change in `maxHp` is never a wound or a heal — it is an Almanac node
     * landing, or a stage arriving with a different Sun — so the pool forgets
     * what it knew and adopts the new figure in silence. Without it, the first
     * frame of every stage reports the whole bar as a repair.
     */
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

  /**
   * Refresh the synergy preview.
   *
   * `timeToNextConjunction` simulates the rings forward up to two minutes, so
   * it must never run per frame. It runs when the formation changes, and again
   * once the predicted alignment has passed.
   */
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

    // Regulation buys knowing sooner. The default horizon is two minutes;
    // previewHorizon extends how far ahead the search will look.
    const seconds = timeToNextConjunction(sim, 120 + sim.effects.previewHorizon)
    this.nextConjunctionAt = seconds === null ? null : sim.elapsed + seconds
  }

  /**
   * Publish a starting balance without it reading as a gain.
   *
   * The projection starts at zero and the save does not, so the first
   * `publishSalvage` of a session sees the whole balance as a delta and flashes
   * it as though it had just been earned. Worse, until that first frame lands
   * the HUD shows **zero Salvage** for a save that has plenty — which in a
   * throttled or backgrounded tab, where `requestAnimationFrame` may not run
   * for a long time, reads as a save that was wiped.
   *
   * Called once by `bootstrap` before the loop starts.
   */
  primeSalvage(balance: number): void {
    this.salvage = balance
    this.salvagePool.prime(balance)
    this.salvageGain = 0
    this.salvageLoss = 0
  }

  /**
   * Publish the spendable Salvage balance and age the pooled gain.
   *
   * **The balance, not the stage's earnings.** Those were the same number until
   * Phase 24 gave Salvage something to buy; now the HUD must show what can
   * actually be spent, and only `bootstrap` — which owns the save — knows it.
   * Publishing both from two places made the counter flip between them.
   *
   * The delta is taken against the previous *projected* value rather than a
   * remembered total, so a reload mid-stage shows no phantom gain. A negative
   * delta is a purchase, and must not read as a gain.
   */
  publishSalvage(balance: number, elapsed: number): void {
    /*
     * Against the previous *projected* value rather than a remembered total, so
     * a reload mid-stage shows no phantom gain — which is why the pool is
     * pushed the balance rather than being told the delta. A test writes
     * `salvageGain` directly to stand in for a float that has already played;
     * the mirror below is what makes that hold until the next real movement.
     */
    this.salvagePool.push(balance, elapsed)
    this.salvage = balance
    this.salvageGain = this.salvagePool.gain
    this.salvageLoss = this.salvagePool.loss
  }

  /** Refresh the telemetry readout, at most once a second. */
  private syncTelemetry(simulation: Simulation): void {
    const telemetry = simulation.state.telemetry
    if (!telemetry) return

    if (telemetry.elapsed - this.telemetryClock < 1) return
    this.telemetryClock = telemetry.elapsed

    this.telemetryRows = telemetry
      .ranked()
      // `share > 0` rather than reading `stats.damageDealt`: it is the same
      // predicate, and it keeps the collector's field names out of the bundle,
      // which is what tests/telemetry.test.ts asserts on.
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
    // Both belong to the stage that just ended. Carrying them forward would
    // show the previous stage's Key award on the next stage's clear banner.
    this.lastClearanceAward = null
    this.nextStageIn = 0
    this.salvageGain = 0
    this.salvageLoss = 0

    // The stage that follows is a different Sun with a full bar. Carrying the
    // pool across would open it on a repair the size of the last stage's
    // damage.
    this.outputPool.clear()
    this.outputLoss = 0
    this.outputGain = 0
  }
}

export const game = new GameStore()
