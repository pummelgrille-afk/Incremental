/**
 * The sprite manifest.
 *
 * PLAN.md Phase 37 asks for "a preload manifest, so Vite bundles them
 * correctly", and that phrase is the whole design. A sprite referenced by a
 * string built at runtime — `` `/assets/sprites/${key}.png` `` — works in `npm
 * run dev` and produces a 404 in a build, because Vite fingerprints asset
 * filenames and only rewrites references it can see statically. `import.meta.
 * glob` with `eager` is a reference it can see: every file is resolved at build
 * time, hashed, and emitted, and this module receives the final URLs.
 *
 * **No Pixi here.** Turning a URL into a texture is the render layer's job
 * (`render.ts`), which keeps rule 1 of docs/architecture.md §Layer boundaries
 * intact: everything under `core/` except the renderer itself stays runnable in
 * a plain Vitest process with no DOM. A manifest of strings is exactly that, so
 * the mapping between content and art is testable without a canvas.
 *
 * The `raw/` subdirectory is deliberately *not* matched: the glob is one level
 * deep. Those are the supplied originals, kept beside the output so
 * `tools/normalise-sprites.py` can always be re-run, and they must never reach
 * a bundle — they are a hundred times the size of the sprites the game draws.
 */

import { ANIMATION_STATES, type AnimationState } from './animation'

const MODULES = import.meta.glob('../../assets/sprites/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

/** `../../assets/sprites/contact-1.png` → `contact-1`. */
function keyOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1).replace(/\.png$/, '')
}

/**
 * Every sprite, by asset key.
 *
 * The key is the filename without its extension, which is what makes
 * `ContentDef.assetKey` a plain authored string rather than a path a content
 * author has to keep in step with a directory layout.
 */
export const SPRITE_MANIFEST: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(Object.entries(MODULES).map(([path, url]) => [keyOf(path), url])),
)

export const SPRITE_KEYS: readonly string[] = Object.freeze(Object.keys(SPRITE_MANIFEST).sort())

export function hasSprite(key: string): boolean {
  return key in SPRITE_MANIFEST
}

/** The bundled URL for a key, or null when nothing is staged under it. */
export function spriteUrl(key: string): string | null {
  return SPRITE_MANIFEST[key] ?? null
}

/**
 * Asset keys that content references but no file provides.
 *
 * A missing sprite is a silent failure at runtime — the renderer falls back to
 * its primitive and the game looks like it did before, which is precisely the
 * kind of dead configuration this project keeps finding late. `tests/assets.
 * test.ts` fails the build on it instead.
 */
export function missingSprites(keys: readonly (string | undefined)[]): string[] {
  const missing = new Set<string>()
  for (const key of keys) {
    if (key !== undefined && !hasSprite(key)) missing.add(key)
  }
  return [...missing].sort()
}

/**
 * Sprites nothing references.
 *
 * Not an error and not failed by a test — art arrives before the content that
 * uses it, which is the whole point of staging it. Reported so a phase that
 * thinks it has wired everything can see what it has not.
 */
export function unusedSprites(keys: readonly (string | undefined)[]): string[] {
  const used = new Set(keys.filter((key): key is string => key !== undefined))
  // Animation frames are reached through their clip's key, never referenced by
  // content directly, so they are used by definition.
  return SPRITE_KEYS.filter((key) => !used.has(key) && !isFrameKey(key))
}

// ---------------------------------------------------------------------------
// Animation frames
//
// A frame is an ordinary sprite under a naming convention rather than a new
// kind of asset: `<key>-<state>-<n>.png`, 1-based, so `bolt-attack-1.png` is
// the first frame of Bolt's attack. That means frames arrive through the same
// glob, the same normaliser and the same bundling as everything else, and a
// single-frame unit needs no animation authoring at all.
//
// Discovery is done once at module load, not per lookup: the manifest cannot
// change at runtime, and the render layer asks for these once per entity.
// ---------------------------------------------------------------------------

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
    // By frame number, not by string: `-10` must follow `-9`, and the manifest
    // is sorted lexically.
    frames.sort((a, b) => a.index - b.index)
    sorted.set(clip, frames.map((frame) => frame.key))
  }
  return sorted
}

const CLIPS_BY_KEY = buildClips()

/**
 * The sprite keys making up one clip, in order.
 *
 * Falls back twice, and both falls are load-bearing:
 *
 *   1. A state with no frames of its own uses **idle**, so a unit can be given
 *      an attack animation without also needing a death one.
 *   2. Idle with no frames of its own uses the **bare key**, so every unit
 *      wired in Phase 37 keeps working untouched and a one-frame unit is just a
 *      clip of length one.
 *
 * Returns an empty array only when nothing is staged under the key at all,
 * which is the case the renderer answers with its primitive.
 */
export function spriteFrames(key: string, state: AnimationState): readonly string[] {
  const own = CLIPS_BY_KEY.get(`${key}:${state}`)
  if (own && own.length > 0) return own

  if (state !== 'idle') {
    const idle = CLIPS_BY_KEY.get(`${key}:idle`)
    if (idle && idle.length > 0) return idle
  }

  return hasSprite(key) ? [key] : []
}

/** Whether a key has frames authored specifically for a state. */
export function hasClip(key: string, state: AnimationState): boolean {
  const own = CLIPS_BY_KEY.get(`${key}:${state}`)
  return own !== undefined && own.length > 0
}

/**
 * Which clips a key actually has, for reporting.
 *
 * Phase 38 ships the system before most of the art, so "what is animated" is a
 * number that will move for several phases. A test prints it rather than
 * asserting a total, because a total would have to be edited every time a
 * single clip lands.
 */
export function clipCoverage(key: string): Record<AnimationState, boolean> {
  const coverage = {} as Record<AnimationState, boolean>
  for (const state of ANIMATION_STATES) coverage[state] = hasClip(key, state)
  return coverage
}

/**
 * Keys that are frames of a clip rather than sprites in their own right.
 *
 * `unusedSprites` would otherwise report every authored frame as staged and
 * unwired, since content references `bolt`, never `bolt-attack-2`.
 */
export function isFrameKey(key: string): boolean {
  return FRAME_PATTERN.test(key)
}
