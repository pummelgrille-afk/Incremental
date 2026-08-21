import type { StagePhase } from '../core/simulation'
import type { Simulation } from '../core/loop'
import { TARGET_FRAME_MS } from '../content/budgets'
import { timeToNextConjunction } from '../systems/synergy'
import { pairingOf, type TypePairing } from '../content/damageTypes'
import type { DamageType } from '../entities/types'
import type { UpgradeBranch } from '../entities/Upgrade'
import type { UnavailableReason } from '../progression/upgradeTree'

/**
 * The Escapement Tree, projected for the view.
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
  tension = $state(0)
  maxTension = $state(0)
  shield = $state(0)
  /** Lowest Tension fraction reached this stage. Drives "cleared untouched". */
  lowestTensionFraction = $state(1)
  repairsThisStage = $state(0)

  // Economy
  filings = $state(0)
  /** Permanent currencies. Unchanged by anything the field does. */
  recollection = $state(0)
  keys = $state(0)

  /**
   * Recent Filings gain, pooled for the HUD's counter.
   *
   * Pooled rather than per-drop: kills arrive dozens a second and an animation
   * each would strobe. Accumulated here rather than in the component because
   * `syncFrom` already runs exactly once a frame — doing it in a `$effect`
   * would mean guessing a frame rate and risking a self-triggering read.
   */
  filingsGain = $state(0)
  private gainExpiresAt = 0

  /**
   * Seconds until the next stage loads, or 0 when nothing is queued.
   *
   * Interim, until Phase 33's stage-select. It exists so the clear banner can
   * say what happens next instead of leaving the field stopped with no
   * explanation, which is exactly how it read before.
   */
  nextStageIn = $state(0)

  /** Set once when a stage clear pays Keys. The HUD clears it after showing. */
  lastKeyAward = $state<{ keys: number; zoneCompleted: boolean } | null>(null)

  // Stage progress
  zoneName = $state('')
  stageName = $state('')
  waveNumber = $state(0)
  waveCount = $state(0)
  phase = $state<StagePhase>('loading')

  // Field
  slackCount = $state(0)
  projectilesLive = $state(0)
  movementCount = $state(0)
  chimeCount = $state(0)

  // Session counters
  slackKilled = $state(0)
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

  // The Beat — the only live input
  beatCharge = $state(0)
  beatMaxCharge = $state(0)
  beatCooldown = $state(0)
  beatsStruck = $state(0)

  // Performance, shown when settings.showFps is on
  fps = $state(0)
  frameMs = $state(0)
  simMs = $state(0)
  renderMs = $state(0)
  projectilePeak = $state(0)
  projectileExhausted = $state(0)
  slackPeak = $state(0)
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

  /** The synergy preview panel. Toggled with F; deliberately not persisted. */
  showFormation = $state(false)

  /** The Escapement Tree view. Toggled with T, once revealed. */
  showTree = $state(false)
  /** Hidden entirely until the first boss clear — economy-spec.md §3. */
  treeRevealed = $state(false)

  // The tree. Pushed by bootstrap on change, not read per frame.
  tree = $state<TreeNodeView[]>([])
  treeRefund = $state(0)
  /** Installed by bootstrap. Null until the session exists. */
  treeActions = $state<TreeActions | null>(null)

  tensionFraction = $derived(this.maxTension > 0 ? this.tension / this.maxTension : 0)

  /** Cleared without taking a single hit — the "Within Tolerance" condition. */
  clearedUntouched = $derived(this.phase === 'cleared' && this.lowestTensionFraction >= 1)

  /** True while the player can act — used to gate input and dim the field. */
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
  beatsReady = $derived(Math.floor(this.beatCharge))
  canStrike = $derived(this.beatsReady >= 1 && this.beatCooldown <= 0 && this.running)

  /**
   * Progress toward the next moment the Beat can be struck, 0–1.
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
  beatProgress = $derived.by(() => {
    // A resolved stage refuses strikes whatever the charge, so a full bar there
    // would advertise an input that does nothing.
    if (!this.running) return 0
    if (this.beatsReady >= 1) return 1
    return this.beatCharge - Math.floor(this.beatCharge)
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

    this.tension = sim.mainspring.hp
    this.maxTension = sim.mainspring.maxHp
    this.shield = sim.mainspring.shield
    this.lowestTensionFraction = sim.mainspring.lowestFraction
    this.repairsThisStage = sim.mainspring.repairsThisStage
    this.syncFilings(sim.filingsEarned, sim.elapsed)

    this.zoneName = sim.zone.name
    this.stageName = sim.stage.name
    this.waveNumber = sim.waveIndex + 1
    this.waveCount = sim.stage.waves.length
    this.phase = sim.phase

    this.slackCount = sim.slack.length
    this.projectilesLive = simulation.projectiles.live
    this.movementCount = sim.movements.length
    this.chimeCount = sim.chimes.length

    this.slackKilled = simulation.totalSlackKilled
    this.conjunctions = simulation.totalConjunctions

    this.projectilePeak = simulation.projectiles.peak
    this.projectileExhausted = simulation.projectiles.exhausted
    this.slackPeak = simulation.peakSlack
    this.ticksOverBudget = simulation.ticksOverSlackBudget
    this.feedDropped = sim.feed.dropped

    this.elapsed = sim.elapsed
    this.syncFormation(simulation)
    this.syncTelemetry(simulation)

    this.beatCharge = sim.beat.charge
    this.beatMaxCharge = sim.beat.maxCharge
    this.beatCooldown = sim.beat.cooldown
    this.beatsStruck = sim.beat.struck
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
    for (const m of sim.movements) {
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
      this.formation = sim.movements.map((m) => ({
        id: m.id,
        ring: m.slot.ring,
        slot: m.slot.slot,
        name: m.def.name,
        damageType: m.def.damageType,
        attackBonus: m.bonuses.attack,
        defenceBonus: m.bonuses.defence,
        rangeBonus: m.bonuses.range,
      }))
      this.pairing = pairingOf(sim.movements.map((m) => m.def.damageType))
    }

    const seconds = timeToNextConjunction(sim)
    this.nextConjunctionAt = seconds === null ? null : sim.elapsed + seconds
  }

  /** How long a gain stays on screen. */
  private static readonly GAIN_WINDOW = 1.1

  /**
   * Bank the frame's Filings delta and age the pooled total.
   *
   * The delta is taken against the previous *projected* value rather than a
   * remembered stage total, so a reload mid-stage shows no phantom gain.
   */
  private syncFilings(earned: number, elapsed: number): void {
    const delta = earned - this.filings
    this.filings = earned

    if (delta > 0) {
      this.filingsGain += delta
      this.gainExpiresAt = elapsed + GameStore.GAIN_WINDOW
    } else if (this.filingsGain > 0 && elapsed >= this.gainExpiresAt) {
      this.filingsGain = 0
    }
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
    this.slackKilled = 0
    this.conjunctions = 0
    this.phase = 'loading'
    // Both belong to the stage that just ended. Carrying them forward would
    // show the previous stage's Key award on the next stage's clear banner.
    this.lastKeyAward = null
    this.nextStageIn = 0
    this.filingsGain = 0
  }
}

export const game = new GameStore()
