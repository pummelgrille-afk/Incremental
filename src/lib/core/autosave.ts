import type { SaveManager } from './save'
import type { SaveData } from './saveSchema'

/**
 * Autosave scheduling: an interval, plus explicit key events.
 *
 * Deliberately free of DOM APIs — no timers, no `beforeunload`. The game loop
 * drives it with `tick(dt)` and the app layer wires browser events to
 * `flush()`. That keeps it testable in a plain Node process and keeps save
 * timing tied to simulation time rather than to wall-clock timers that keep
 * firing while the tab is frozen.
 */

export type SaveReason =
  | 'interval'
  /** Stage cleared — Clearance may have been awarded. Never lose this. */
  | 'stage-clear'
  /** Currency spent. */
  | 'purchase'
  /** Prestige. The single most expensive event to lose. */
  | 'rewind'
  /** Player pressed save, or the tab is closing. */
  | 'manual'
  | 'shutdown'

/** Reasons that bypass coalescing and write immediately. */
const CRITICAL: ReadonlySet<SaveReason> = new Set<SaveReason>([
  'stage-clear',
  'rewind',
  'manual',
  'shutdown',
])

export interface AutosaveOptions {
  /** Seconds between routine saves. */
  intervalSeconds?: number
  /** Minimum seconds between non-critical writes, to stop thrashing. */
  minGapSeconds?: number
  /** Ceiling for the failure backoff. */
  maxBackoffSeconds?: number
}

export interface AutosaveStats {
  writes: number
  failures: number
  lastReason: SaveReason | null
  /** Seconds of simulation time since the last successful write. */
  sinceLastWrite: number
}

export class Autosaver {
  private readonly interval: number
  private readonly minGap: number
  private readonly maxBackoff: number

  private sinceSave = 0
  private sinceAnyWrite = Infinity
  private pending: SaveReason | null = null

  /** Grows on consecutive failures so a full quota is not hammered. */
  private backoff = 0

  private stats: AutosaveStats = {
    writes: 0,
    failures: 0,
    lastReason: null,
    sinceLastWrite: 0,
  }

  constructor(
    private readonly manager: SaveManager,
    /** Called at write time, so the caller never hands over a stale snapshot. */
    private readonly snapshot: () => SaveData,
    options: AutosaveOptions = {},
  ) {
    this.interval = options.intervalSeconds ?? 15
    this.minGap = options.minGapSeconds ?? 2
    this.maxBackoff = options.maxBackoffSeconds ?? 300
  }

  /** Advance by simulation time. Called once per tick. */
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

  /**
   * Note that something save-worthy happened.
   *
   * Critical reasons write immediately. Everything else is coalesced until the
   * minimum gap has passed, so a burst of purchases produces one write.
   */
  request(reason: SaveReason): boolean {
    if (CRITICAL.has(reason)) return this.write(reason)

    this.pending = reason
    return false
  }

  /** Write now, ignoring coalescing and backoff. Returns success. */
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
      // Exponential backoff: a persistently full quota should not retry every
      // interval forever, but must keep trying in case space is freed.
      this.backoff = Math.min(this.maxBackoff, this.backoff === 0 ? this.interval : this.backoff * 2)
    }

    return ok
  }

  getStats(): Readonly<AutosaveStats> {
    return { ...this.stats }
  }

  /** True when writes are failing — Phase 42 surfaces this as a warning. */
  get degraded(): boolean {
    return this.backoff > 0
  }
}
