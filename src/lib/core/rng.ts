
export interface Rng {
  next(): number

  range(min: number, max: number): number

  int(min: number, max: number): number

  angle(): number
  pick<T>(items: readonly T[]): T

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

export function seedFrom(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}
