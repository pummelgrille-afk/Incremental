/**
 * Dev-only combat telemetry.
 *
 * PLAN.md Phase 20 asks for time-to-clear, deaths and DPS per ally, gated
 * behind `import.meta.env.DEV` so it is stripped from production builds.
 *
 * **It is a sink, never a source.** Nothing in the simulation reads a value
 * back out of here, which is what licenses recording at all — the same argument
 * as `systems/feed.ts`. A test asserts two runs from one seed produce identical
 * outcomes with telemetry on and off.
 *
 * Attribution is by **definition id, not instance**. Two Hammers are one row.
 * The question this answers is "is a Hammer worth its cost", which is a content
 * question; per-instance numbers would only measure which slot got lucky.
 */

/** What one unit type contributed over a run. */
export interface SourceStats {
  /** Damage that landed, after armour and defence. */
  damageDealt: number
  /** Damage absorbed or taken, for units that can be hit. */
  damageTaken: number
  kills: number
  /** Times a unit of this type was disabled. */
  disables: number
  /** Seconds this type spent on the field, summed across its units. */
  unitSeconds: number
}

export interface WaveStats {
  index: number
  seconds: number
  spawned: number
  killed: number
  /** Tension lost during this wave, as a fraction of maximum. */
  tensionLost: number
}

function emptySource(): SourceStats {
  return { damageDealt: 0, damageTaken: 0, kills: 0, disables: 0, unitSeconds: 0 }
}

export class Telemetry {
  /** Keyed by def id — allies, Chimes, the Beat, and conjunctions alike. */
  readonly sources = new Map<string, SourceStats>()
  readonly waves: WaveStats[] = []

  /** Seconds of simulated combat, which is what a DPS denominator wants. */
  elapsed = 0
  stageSeconds: number | null = null
  outcome: 'running' | 'cleared' | 'lost' = 'running'

  /** Damage the Mainspring took, in absolute Tension. */
  tensionLost = 0
  beatsStruck = 0
  conjunctionsFired = 0

  private stat(id: string): SourceStats {
    let stats = this.sources.get(id)
    if (!stats) {
      stats = emptySource()
      this.sources.set(id, stats)
    }
    return stats
  }

  damage(sourceId: string, amount: number, killed = false): void {
    const stats = this.stat(sourceId)
    stats.damageDealt += amount
    if (killed) stats.kills++
  }

  took(sourceId: string, amount: number): void {
    this.stat(sourceId).damageTaken += amount
  }

  disabled(sourceId: string): void {
    this.stat(sourceId).disables++
  }

  /** Called once per tick with the live unit types, for the DPS denominator. */
  present(sourceIds: Iterable<string>, dt: number): void {
    for (const id of sourceIds) this.stat(id).unitSeconds += dt
  }

  wave(stats: WaveStats): void {
    this.waves.push(stats)
  }

  /**
   * Damage per second *while slotted*, per unit of that type.
   *
   * Divided by `unitSeconds` rather than by wall-clock: a unit added halfway
   * through a stage would otherwise read as half as good as an identical one
   * present throughout, which says nothing about the unit.
   */
  dps(sourceId: string): number {
    const stats = this.sources.get(sourceId)
    if (!stats || stats.unitSeconds <= 0) return 0
    return stats.damageDealt / stats.unitSeconds
  }

  /** Every source ranked by contribution. The headline read for balancing. */
  ranked(): { id: string; dps: number; share: number; stats: SourceStats }[] {
    const total = [...this.sources.values()].reduce((sum, s) => sum + s.damageDealt, 0)
    return [...this.sources.entries()]
      .map(([id, stats]) => ({
        id,
        dps: this.dps(id),
        share: total > 0 ? stats.damageDealt / total : 0,
        stats,
      }))
      .sort((a, b) => b.stats.damageDealt - a.stats.damageDealt)
  }

  reset(): void {
    this.sources.clear()
    this.waves.length = 0
    this.elapsed = 0
    this.stageSeconds = null
    this.outcome = 'running'
    this.tensionLost = 0
    this.beatsStruck = 0
    this.conjunctionsFired = 0
  }
}

/**
 * Build a collector, or `null` in a production build.
 *
 * The ternary is what makes this strippable: Vite replaces `import.meta.env.DEV`
 * with a literal, so a production bundle sees `() => null`, `Telemetry` loses
 * its only reference, and the class is tree-shaken out. A runtime `if` inside
 * the class would have shipped every line of it.
 *
 * A test asserts the built bundle contains none of this module's strings.
 */
export function createTelemetry(): Telemetry | null {
  return import.meta.env.DEV ? new Telemetry() : null
}

/** Source ids for the things that deal damage but are not slotted units. */
export const TELEMETRY_SOURCES = {
  beat: 'the-beat',
  conjunction: 'conjunction',
} as const
