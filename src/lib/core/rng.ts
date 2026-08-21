/**
 * Seeded pseudo-random number generator.
 *
 * The simulation never calls `Math.random()`. Two reasons:
 *
 *   1. Tests need a wave to spawn identically every run, or balance assertions
 *      are flaky by construction.
 *   2. Phase 20's telemetry compares runs against each other. That only means
 *      something if the randomness is reproducible from a seed.
 *
 * mulberry32: small, fast, and statistically fine for spawn jitter and spread
 * angles. Not cryptographic, and nothing here needs it to be.
 */

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number
  /** Uniform in [min, max). */
  range(min: number, max: number): number
  /** Integer in [min, max]. */
  int(min: number, max: number): number
  /** Uniform angle in radians. */
  angle(): number
  pick<T>(items: readonly T[]): T
  /** Current internal state, so a run can be resumed or replayed. */
  readonly state: number
}

export function createRng(seed = 0x9e3779b9): Rng {
  let s = seed >>> 0

  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    angle: () => next() * Math.PI * 2,
    pick: (items) => items[Math.floor(next() * items.length)],
    get state() {
      return s
    },
  }
}

/** Derive a stable seed from a string, so a stage always plays the same. */
export function seedFrom(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}
