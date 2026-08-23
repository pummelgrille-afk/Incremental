import type { SaveManager } from './save'
import type { SaveData } from './saveSchema'

export type SaveReason =
  | 'interval'

  | 'stage-clear'

  | 'purchase'

  | 'rewind'

  | 'settings'

  | 'manual'
  | 'shutdown'

const CRITICAL: ReadonlySet<SaveReason> = new Set<SaveReason>([
  'stage-clear',
  'rewind',
  'manual',
  'shutdown',
])

export interface AutosaveOptions {
  intervalSeconds?: number

  minGapSeconds?: number

  maxBackoffSeconds?: number
}

export interface AutosaveStats {
  writes: number
  failures: number
  lastReason: SaveReason | null

  sinceLastWrite: number
}

export class Autosaver {
  private readonly interval: number
  private readonly minGap: number
  private readonly maxBackoff: number

  private sinceSave = 0
  private sinceAnyWrite = Infinity
  private pending: SaveReason | null = null

  private backoff = 0

  private stats: AutosaveStats = {
    writes: 0,
    failures: 0,
    lastReason: null,
    sinceLastWrite: 0,
  }

  constructor(
    private readonly manager: SaveManager,

    private readonly snapshot: () => SaveData,
    options: AutosaveOptions = {},
  ) {
    this.interval = options.intervalSeconds ?? 15
    this.minGap = options.minGapSeconds ?? 2
    this.maxBackoff = options.maxBackoffSeconds ?? 300
  }

  tick(dt: number): void {
    this.sinceSave += dt
    this.sinceAnyWrite += dt
    this.stats.sinceLastWrite = this.sinceAnyWrite

    if (this.pending && this.sinceAnyWrite >= this.minGap) {
      const reason = this.pending
      this.pending = null
      this.write(reason)
      return
    }

    if (this.sinceSave >= this.interval + this.backoff) {
      this.write('interval')
    }
  }

  request(reason: SaveReason): boolean {
    if (CRITICAL.has(reason)) return this.write(reason)

    this.pending = reason
    return false
  }

  flush(reason: SaveReason = 'manual'): boolean {
    this.pending = null
    return this.write(reason, true)
  }

  private write(reason: SaveReason, force = false): boolean {
    if (!force && this.sinceAnyWrite < this.minGap && reason === 'interval') {
      return false
    }

    const ok = this.manager.save(this.snapshot())

    this.sinceSave = 0
    this.stats.lastReason = reason

    if (ok) {
      this.sinceAnyWrite = 0
      this.stats.sinceLastWrite = 0
      this.stats.writes++
      this.backoff = 0
    } else {
      this.stats.failures++

      this.backoff = Math.min(this.maxBackoff, this.backoff === 0 ? this.interval : this.backoff * 2)
    }

    return ok
  }

  getStats(): Readonly<AutosaveStats> {
    return { ...this.stats }
  }

  get degraded(): boolean {
    return this.backoff > 0
  }
}
