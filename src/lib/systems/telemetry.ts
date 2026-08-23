
export interface SourceStats {
  damageDealt: number

  damageTaken: number
  kills: number

  disables: number

  unitSeconds: number
}

export interface WaveStats {
  index: number
  seconds: number
  spawned: number
  killed: number

  outputLost: number
}

function emptySource(): SourceStats {
  return { damageDealt: 0, damageTaken: 0, kills: 0, disables: 0, unitSeconds: 0 }
}

export class Telemetry {
  readonly sources = new Map<string, SourceStats>()
  readonly waves: WaveStats[] = []

  elapsed = 0
  stageSeconds: number | null = null
  outcome: 'running' | 'cleared' | 'lost' = 'running'

  outputLost = 0
  flaresStruck = 0
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

  present(sourceIds: Iterable<string>, dt: number): void {
    for (const id of sourceIds) this.stat(id).unitSeconds += dt
  }

  wave(stats: WaveStats): void {
    this.waves.push(stats)
  }

  dps(sourceId: string): number {
    const stats = this.sources.get(sourceId)
    if (!stats || stats.unitSeconds <= 0) return 0
    return stats.damageDealt / stats.unitSeconds
  }

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
    this.outputLost = 0
    this.flaresStruck = 0
    this.conjunctionsFired = 0
  }
}

export function createTelemetry(): Telemetry | null {
  return import.meta.env.DEV ? new Telemetry() : null
}

export const TELEMETRY_SOURCES = {
  flare: 'the-flare',
  conjunction: 'conjunction',
} as const
