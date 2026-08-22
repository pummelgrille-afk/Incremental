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
  return SPRITE_KEYS.filter((key) => !used.has(key))
}
