import type { StagePhase } from '../core/simulation'
import type { Simulation } from '../core/loop'
import { TARGET_FRAME_MS } from '../content/budgets'

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

  /** Mirrors settings.showFps. Toggled with F2, persisted to the save. */
  showDiagnostics = $state(false)

  tensionFraction = $derived(this.maxTension > 0 ? this.tension / this.maxTension : 0)

  /** Cleared without taking a single hit — the "Within Tolerance" condition. */
  clearedUntouched = $derived(this.phase === 'cleared' && this.lowestTensionFraction >= 1)

  /** True while the player can act — used to gate input and dim the field. */
  running = $derived(this.phase === 'wave-active' || this.phase === 'wave-gap')

  /** True when the frame budget is at risk — drives the diagnostics warning. */
  overFrameBudget = $derived(this.simMs + this.renderMs > TARGET_FRAME_MS)

  /** Whole charges available. Fractional regeneration is not spendable. */
  beatsReady = $derived(Math.floor(this.beatCharge))
  canStrike = $derived(this.beatsReady >= 1 && this.beatCooldown <= 0 && this.running)

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
    this.filings = sim.filingsEarned

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

    this.beatCharge = sim.beat.charge
    this.beatMaxCharge = sim.beat.maxCharge
    this.beatCooldown = sim.beat.cooldown
    this.beatsStruck = sim.beat.struck
  }

  reset(): void {
    this.slackKilled = 0
    this.conjunctions = 0
    this.phase = 'loading'
  }
}

export const game = new GameStore()
