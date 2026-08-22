/**
 * A pooled change in a number, for the HUD's gain and loss readouts.
 *
 * The problem this solves is the one Phase 40 hit with particles and Phase 41
 * hit with sound, arriving a third time in the DOM: **what an effect costs is
 * how often it fires.** Salvage lands dozens of times a second at a full
 * formation and the Sun is hit at a comparable rate. A float per event would be
 * a strobe, and a strobe is not a readout — the player would end up reading the
 * balance instead, which is the thing the animation was meant to save them
 * from.
 *
 * So movement is *accumulated* over a short window and reported once. What the
 * player sees is "+240 in the last second", not two hundred separate numbers.
 *
 * Deliberately framework-free and here rather than in `stores/`: it is
 * arithmetic with one interesting rule in it, and a rule that lives in a
 * component or a rune is a rule nothing can test.
 */
export class PooledDelta {
  /**
   * The last value seen, or `null` when the next one should be adopted in
   * silence — at construction, after `clear()`, and therefore across every
   * stage load. The projection starts at zero and a loaded save does not, so
   * without this the first push of a session reports the whole balance as
   * income and a fresh stage reports full Output as a heal.
   */
  private previous: number | null = null

  private gainPool = 0
  private lossPool = 0
  private gainUntil = 0
  private lossUntil = 0

  /** @param window How long a pooled figure stays on screen, in seconds. */
  constructor(private readonly window: number) {}

  /** Accumulated rise still inside the window, or 0. */
  get gain(): number {
    return this.gainPool
  }

  /** Accumulated fall still inside the window, positive, or 0. */
  get loss(): number {
    return this.lossPool
  }

  /**
   * Record the current value and age both pools.
   *
   * `now` is simulated seconds, not wall clock: a backgrounded tab stops the
   * simulation, and a figure that expired against real time would vanish before
   * the player ever came back to look at it.
   */
  push(value: number, now: number): void {
    const previous = this.previous
    this.previous = value

    if (previous === null) {
      // Adopted, not reported. See `previous` above.
      this.gainPool = 0
      this.lossPool = 0
      return
    }

    const delta = value - previous

    /*
     * Movement one way clears the other way.
     *
     * A player cannot read "+40" and "−12" side by side as anything but a
     * contradiction, and the older of the two is the one they have already
     * seen. The freshest movement is the one worth a pixel — which also means
     * spending Salvage stops the kill it was funded by from still being
     * advertised.
     */
    if (delta > 0) {
      this.gainPool += delta
      this.gainUntil = now + this.window
      this.lossPool = 0
    } else if (delta < 0) {
      this.lossPool -= delta
      this.lossUntil = now + this.window
      this.gainPool = 0
    }

    if (this.gainPool > 0 && now >= this.gainUntil) this.gainPool = 0
    if (this.lossPool > 0 && now >= this.lossUntil) this.lossPool = 0
  }

  /**
   * Adopt a value without reporting it as movement.
   *
   * For the balance a save arrives holding: it is not income, and animating it
   * as such is the difference between "welcome back" and "something just
   * happened".
   */
  prime(value: number): void {
    this.previous = value
    this.gainPool = 0
    this.lossPool = 0
  }

  /** Forget everything, including what the value was. The next push is silent. */
  clear(): void {
    this.previous = null
    this.gainPool = 0
    this.lossPool = 0
  }
}
