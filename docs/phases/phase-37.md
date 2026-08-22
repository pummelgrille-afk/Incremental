# Phase 37: Art Style Guide & Asset Pipeline

**Stage 5 — Art & Audio** (first phase)
Output: `docs/design/art-style.md`, `core/assetLoader.ts`,
`tools/normalise-sprites.py`, `tests/assets.test.ts`, sprites wired through
`render.ts`

## Checklist

- [x] Palette, resolution and pixel-density standards locked in
      `docs/design/art-style.md`
- [x] Sprite import pipeline: raw art in `src/assets/`, a preload manifest in
      `core/assetLoader.ts`
- [x] VFX rules so bullets stay readable against backgrounds
- [x] The two items Phase 29 left for this phase: the supplied art cleaned up,
      and the `--brass` palette renamed

## The supplied art was measured before anything was decided

Phase 29 noted the ten staged PNGs were "JPEG-compressed before the background
was removed" and left the cleanup here. Measured properly this time:

| | Supplied | After |
|---|---|---|
| Colours per sprite | 3,964 – 16,609 | 24 |
| Partially transparent pixels | 1.1 – 3.2% | 0 |
| Size | 79 – 237 KB | 0.6 – 1.9 KB |
| Dimensions | 461×542 – 515×484 | 31×31 – 40×40 |

The cell period measures 11–14px on canvases of ~500px, which is where the
**40 × 40 native grid** in the style guide comes from — measured, not chosen.
Two sprites read at 21 and 25, which is the JPEG smear rather than different
art.

Total: 1.3 MB of art became 12.7 KB, and it is *cleaner* at the size the game
draws it. `tools/normalise-sprites.py` is the step, run by hand rather than at
build time — a TypeScript project has no business requiring Pillow to build —
with the originals kept at `src/assets/sprites/raw/` so it can always be re-run.

The order inside it matters and is documented in the file: alpha is
hard-thresholded *before* the colour averages are taken, or the soft halo bleeds
into every edge cell; a cell less than half covered is background, or every
sprite grows a one-pixel fringe of averaged colour.

## The manifest is the pipeline

```
src/assets/sprites/raw/*.png   as supplied — never bundled
  → tools/normalise-sprites.py
src/assets/sprites/*.png       what the game loads
  → import.meta.glob(eager) in core/assetLoader.ts
SPRITE_MANIFEST                assetKey → bundled URL (inlined, at this size)
  → Assets.load in render.ts
Texture, scaleMode 'nearest'
```

PLAN.md's phrasing — "a preload manifest, **so Vite bundles them correctly**" —
is the whole design. A URL built at runtime works in `npm run dev` and 404s in a
build, because Vite fingerprints asset filenames and only rewrites references it
can see statically. An eager glob is a reference it can see.

An unplanned consequence, worth writing down: at 0.6–1.9 KB the sprites fall
under Vite's 4 KB inline threshold, so all ten are emitted as data URIs inside
the bundle rather than as ten separate files. Ten round trips removed, and the
manifest is unchanged — it holds data URIs instead of hashed paths, which the
render layer neither knows nor cares about. Had the normaliser not run, the same
ten would have been 1.3 MB of separate requests.

Two properties are enforced by test rather than by care:

- **`raw/` cannot reach a bundle.** The glob is one level deep; if that ever
  changes, 1.3 MB is silently added to the download for files nothing renders.
- **Content cannot reference art that is not staged.** A mistyped `assetKey`
  produces no error at runtime — the renderer falls back to its primitive and
  the game looks exactly as it did — which is the dead configuration this
  project keeps finding late.

**The loader imports no Pixi.** It resolves strings; the render layer makes
textures. That keeps rule 1 of architecture.md §Layer boundaries intact —
everything under `core/` except `render.ts` stays runnable in a plain Vitest
process — and it is why the content-to-art mapping is testable without a canvas.

## `assetKey` is finally live

Declared on `ContentDef` in Phase 8 and referenced by nothing until now. It
carries both rosters.

Contacts, by **tier** — the thing that changes how a wave must be answered:

| Tier | Sprite | Is |
|------|--------|-----|
| basic | `contact-2` | fills waves |
| elite | `contact-3` | a step up in body and bite |
| specialist | `contact-1` | demands a specific answer |

What that replaces is ten identical grey circles differing only in radius, which
communicated nothing at all.

Platforms, by **damage type** — the thing that decides whether a unit answers
the Contact in front of it:

| Type | Planet | |
|------|--------|--|
| percussive | `venus` | amber |
| shear | `mercury` | blue-violet |
| thermal | `mars` | red-orange |
| resonant | `earth` | blue-green |

Four types, four planets, and each planet's dominant hue sits beside its type's
colour — so the body, the overlay tint and the tracer it fires all agree. That
was the mapping worth waiting for: the first draft of this phase left the four
planets staged and unwired on the grounds that four sprites across ten Platforms
was an art decision for Phase 38, which was a weak reason to ship four images
nobody could see.

Both mappings are interim in the same way and for the same reason: one sprite
per *category* rather than per unit, with Phase 38 owning per-unit art, and a
test in each case asserting the categories stay distinguishable.

## Art and instrumentation are separate layers

A Contact is now two display objects: a `Sprite` body that never changes shape,
and a `Graphics` overlay carrying the telegraph ring and the health arc. The Sun
is the same split — sprite underneath, Output arc and shield ring on top.

That is a rule in the style guide rather than a convenience: **if it encodes a
number it is drawn; if it encodes an identity it is art.** A readout baked into
a 40px sprite stops being legible the moment anything scales and cannot animate
against a value.

It also paid for itself immediately. A hit flash is now a `tint` on the body
instead of a geometry rebuild, so the signature cache Phase 11 built has less to
guard, not more. Measured in the browser at **1.78 ms per frame for simulation
and render together at 192 Contacts**, against a 16.7 ms budget. That is an
absolute measurement, not a before-and-after — no baseline was taken with the
same scene, and the headroom is large enough that one was not worth
manufacturing.

## A table that had been dead for eight phases

`PLATFORM_COLOURS` in `render.ts` was keyed on Platform id and still held
`hammer`, `detent` and `pallet` — ids that stopped existing when Phase 29
renamed the roster. Every lookup had missed since, so all ten Platforms drew in
the same default colour and the table did nothing whatsoever. Nothing failed;
the field quietly lost a distinction it was written to make.

Rekeyed on **damage type**, merged with the tracer table Phase 36's follow-up
work added, so a unit and the shot it fires are always the same colour. A closed
union cannot go stale when the roster is renamed again — the compiler checks it.
This is also the first time the type matrix in `content/damageTypes.ts`, in
place since Phase 8, is visible on the field at all.

## `--brass` is `--corona`

The last two identifiers named for the clockwork setting. The values did not
change: a solar corona is the same gold the brass was. Mechanical rename across
nine components and one stylesheet.

## Verified in the browser

- All ten sprites load, `200`, and nothing under `raw/` is requested.
- The Sun draws its sprite: the centre of the canvas reads `#f29331`, `#f15c24`,
  `#c04c2a` — `sun.png`'s own palette — under the gold Output arc.
- Contacts draw theirs: 427 px of `contact-2`'s teal across a live wave of six,
  and 4 px of the grey fallback primitive, which is to say none.
- Platforms draw theirs: 1,143 px of Venus amber for the opening formation of
  four Bolts. Only `venus` was observed live, because a new save fields four
  percussive Platforms and nothing else — the other three ride the identical
  code path and are pinned by test rather than by observation.
- Projectiles draw theirs: 321 px of comet green with 40 in flight, against 1 px
  of the disc they replaced.
- No console errors; 901 tests and `npm run check` green, and a production build
  that emits no separate sprite files at all.

## Projectiles fly as comets

The last two staged sprites, and the ones that were going to be left for Phase
40 on the grounds that projectiles sit on the renderer's hottest path. They
turned out to be the cheapest swap of the three: **a Sprite costs less than the
Graphics it replaces** — no geometry, so a pooled slot becoming visible is a
texture assignment and a scale instead of a rebuilt circle. What it adds is one
rotation write per projectile per frame.

Hostile fire takes the green comet, owned fire the blue, which is §6 rule 1
doing its job — incoming fire is what must be read first, and green at 0.52
saturation against a near-black field is the louder of the two.

The heading had to be measured. Both comets are drawn pointing down and to the
left, at 134° and 137° from their own centroid, so the renderer turns them by
`atan2(vy, vx) − 135°`. Checked on the field in all four cardinal directions:
the visible mass sits on the side the shot is travelling toward every time. A
comet flying sideways would be worse than the dot it replaced.

Measured at **1.37 ms per frame for simulation and render together with 400 live
projectiles**, against the 600 the budget allows and a 16.7 ms frame.

## What is deferred, and to where

- **No animation.** The pipeline loads single textures. Frames, atlases and an
  animation clock are Phase 38's, and Phase 39's atlasing is what makes them
  affordable.
