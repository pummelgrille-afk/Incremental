
import { ANIMATION_STATES, type AnimationState } from './animation'

const MODULES = import.meta.glob('../../assets/sprites/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

function keyOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1).replace(/\.png$/, '')
}

export const SPRITE_MANIFEST: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(Object.entries(MODULES).map(([path, url]) => [keyOf(path), url])),
)

export const SPRITE_KEYS: readonly string[] = Object.freeze(Object.keys(SPRITE_MANIFEST).sort())

export function hasSprite(key: string): boolean {
  return key in SPRITE_MANIFEST
}

export function spriteUrl(key: string): string | null {
  return SPRITE_MANIFEST[key] ?? null
}

export function missingSprites(keys: readonly (string | undefined)[]): string[] {
  const missing = new Set<string>()
  for (const key of keys) {
    if (key !== undefined && !hasSprite(key)) missing.add(key)
  }
  return [...missing].sort()
}

export function unusedSprites(keys: readonly (string | undefined)[]): string[] {
  const used = new Set(keys.filter((key): key is string => key !== undefined))

  return SPRITE_KEYS.filter((key) => !used.has(key) && !isFrameKey(key))
}

const FRAME_PATTERN = /^(.+)-(idle|attack|hit|death)-(\d+)$/

function buildClips(): Map<string, string[]> {
  const clips = new Map<string, { index: number; key: string }[]>()

  for (const key of SPRITE_KEYS) {
    const match = FRAME_PATTERN.exec(key)
    if (!match) continue

    const clip = `${match[1]}:${match[2]}`
    const frames = clips.get(clip) ?? []
    frames.push({ index: Number(match[3]), key })
    clips.set(clip, frames)
  }

  const sorted = new Map<string, string[]>()
  for (const [clip, frames] of clips) {
    frames.sort((a, b) => a.index - b.index)
    sorted.set(clip, frames.map((frame) => frame.key))
  }
  return sorted
}

const CLIPS_BY_KEY = buildClips()

export function spriteFrames(key: string, state: AnimationState): readonly string[] {
  const own = CLIPS_BY_KEY.get(`${key}:${state}`)
  if (own && own.length > 0) return own

  if (state !== 'idle') {
    const idle = CLIPS_BY_KEY.get(`${key}:idle`)
    if (idle && idle.length > 0) return idle
  }

  return hasSprite(key) ? [key] : []
}

export function hasClip(key: string, state: AnimationState): boolean {
  const own = CLIPS_BY_KEY.get(`${key}:${state}`)
  return own !== undefined && own.length > 0
}

export function clipCoverage(key: string): Record<AnimationState, boolean> {
  const coverage = {} as Record<AnimationState, boolean>
  for (const state of ANIMATION_STATES) coverage[state] = hasClip(key, state)
  return coverage
}

export function isFrameKey(key: string): boolean {
  return FRAME_PATTERN.test(key)
}
