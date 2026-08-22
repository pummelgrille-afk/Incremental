# Art Style Guide

> Locked in Phase 37. Everything here is a constraint on Phases 38–40, not a
> mood board — each rule exists because breaking it costs the player something
> specific, and that cost is named.

## 1. The two palettes, and why there are two

The game runs one palette for **chrome** and a wider one for **the field**, and
that is deliberate rather than an accident of who drew what.

### Chrome — quiet, narrow, gold

| Token | Value | Is |
|-------|-------|-----|
| `--bg` | `#0b0a08` | near-black, everything sits on it |
| `--corona` | `#c9a227` | the one accent: balances, keycaps, buttons |
| `--corona-dim` | `#7a6418` | borders and rules |
| `--text` | `#e8e2d4` | body copy |
| `--muted` | `#8a8474` | secondary copy |

Five tokens, and no sixth without a reason written down. The chrome is a log
room: it must be readable for hours and it must never pull the eye off the
field. `--corona` and `--corona-dim` were `--brass` and `--brass-dim` until this
phase — the last two identifiers still named for the clockwork setting the
Phase 29 reskin replaced. The values did not change; a solar corona is the same
gold the brass was.

### Field — saturated, and allowed to be

The supplied sprites measure between 0.30 and 0.89 mean saturation, against a
background at 0.11 luminance. That is far louder than the chrome, and it is
correct: the field is read **at speed, under load, while something is arriving**,
and the chrome is read at rest. P4 asks for legibility, not for uniformity.

The rule that keeps this from becoming noise is where the saturation is spent:

- **Hostile things are saturated.** Contacts, their projectiles, their
  telegraphs.
- **Owned things are gold or type-coloured.** Platforms, Arrays, tracers, the
  Sun.
- **Nothing else is coloured at all.** Rings, mounts and slot guides are
  `#2a2417` and stay there.

### Damage type is also a body

Four damage types, four planets, and each Platform wears the one whose dominant
hue sits beside its type's colour:

| Type | Planet | Dominant hue |
|------|--------|--------------|
| percussive | `venus` | `#f38e24` amber |
| shear | `mercury` | `#525eff` blue-violet |
| thermal | `mars` | `#e44317` red-orange |
| resonant | `earth` | `#4eb5fd` / `#3bcf35` blue-green |

So a Platform, the tint on its overlay and the tracer it fires all agree, and a
player can read what a unit *answers* without opening a panel. Ten Platforms
share four bodies for now; per-unit art is Phase 38's, and it must not lose the
type read to get it — the same constraint the Contact tiers carry in §5.

### Damage type is a colour, everywhere

The type matrix has been in `content/damageTypes.ts` since Phase 8 and was
invisible on the field until Phase 37. One table now, used by both the Platform
body and the tracer it fires, so a unit and its shot are always the same colour:

| Type | Colour | |
|------|--------|--|
| percussive | `#d8b45a` | gold |
| shear | `#8fb3c9` | pale blue |
| thermal | `#e08a4a` | orange |
| resonant | `#5eead4` | teal |

Never key a lookup on a unit **id**. The table this replaced did, still held
`hammer`/`detent`/`pallet`, and had been missing every lookup for eight phases
without anything failing. A type is a closed union the compiler checks.

## 2. Resolution and pixel density

**Native grid: 40 × 40.** Measured, not chosen — the supplied art's cell period
lands at 11–14px on canvases of ~500px, which is 36–45 cells across. 40 is the
round number inside that range.

**Sprites are trimmed to their own bounds**, so a 40-grid sprite is usually
smaller than 40 × 40 (31–40px in the current set). The renderer scales by the
**longest edge**, so a trimmed sprite is never stretched.

**Drawn at roughly half native.** A Contact's art is `hitboxRadius × 2.6` across
— art wider than the hitbox, on the same argument the Sun's own comment has
made since Phase 10: a near miss must read as a miss.

**Nearest-neighbour filtering, always, no exceptions.** Bilinear on pixel art at
a non-integer scale turns a crisp silhouette into a smear at exactly the size
the player sees it. This is set once, in `render.ts`'s `loadTextures`, for every
texture in the manifest.

**No sprite carries text, a number, or a bar.** See §4.

**Directional art points down-left, at 135°.** Anything the renderer turns to
face a heading — comets today, exhaust and muzzle art later — is authored on
that bearing, and the renderer turns it by `heading − 135°`. Both supplied comet
sprites already agree to within three degrees, which is where the convention
comes from. The alternative is inspecting pixels at load time to work out each
texture's own axis, which is a cost paid on every boot to save an author one
convention.

## 3. The pipeline

```
src/assets/sprites/raw/*.png    as supplied — never bundled
        │  tools/normalise-sprites.py
        ▼
src/assets/sprites/*.png        what the game loads
        │  import.meta.glob(eager) in core/assetLoader.ts
        ▼
SPRITE_MANIFEST                 assetKey → hashed, bundled URL
        │  Assets.load in render.ts
        ▼
Texture, scaleMode 'nearest'
```

Three properties of that chain are load-bearing:

1. **The manifest is static.** A URL built at runtime — `` `/assets/sprites/
   ${key}.png` `` — works in dev and 404s in a build, because Vite fingerprints
   asset filenames and only rewrites references it can see statically.
2. **`raw/` is one level down and the glob is one level deep**, so the supplied
   originals cannot reach a bundle. They are ~130KB each against ~1KB for what
   replaces them; `tests/assets.test.ts` fails if one gets in.
3. **The loader imports no Pixi.** It resolves strings; the render layer makes
   textures. That is what keeps everything under `core/` except `render.ts`
   runnable in a plain Vitest process (architecture.md §Layer boundaries).

New art goes into `raw/` and the script is re-run by hand. It is not a build
step — a TypeScript project has no business requiring Pillow to build — and the
output is committed.

### What the normaliser does

The ten sprites supplied with the reskin were JPEG-compressed *before* their
backgrounds were removed: 4,000–16,600 unique colours each, 1–3% partially
transparent pixels where a cutout should have a hard edge, and a smeared cell
grid on canvases cropped to non-round sizes. Recoverable rather than lost.

Alpha is hard-thresholded first so the halo cannot bleed into the colour
averages; each cell is then box-filtered over its opaque pixels only; the result
is quantised to **24 colours**; then trimmed to its bounds. A cell less than
half covered is background — otherwise every sprite grows a one-pixel fringe.

Result: 1.3MB of art became 12.7KB, and it is cleaner at the size it is drawn.
Small enough, in fact, to fall under Vite's 4KB inline threshold — the sprites
ship as data URIs inside the bundle rather than as ten separate requests. Keep
new art under that threshold where the subject allows it; an atlas (Phase 39) is
the answer when it does not.

## 4. Instrumentation is never art

The Output arc, the Contact health arc, the telegraph ring, the charge pips, the
shield ring and the tracers stay **vector, drawn above the sprite**.

They are a readout, not a picture. Baked into a 40px sprite they stop being
legible the moment anything scales, they cannot animate against a value, and
they would need re-authoring every time a number moves. The split also makes a
hit flash cost a `tint` instead of a geometry rebuild, which is why Phase 37
could add sprites to Contacts without losing Phase 11's per-entity budget.

The practical rule: **if it encodes a number, it is drawn; if it encodes an
identity, it is art.**

## 5. Silhouette

Readability at speed is a silhouette problem, not a detail problem. At 18–29px a
Contact is about twenty by twenty visible pixels, and the player is not looking
at it directly.

- **Tier reads before craft.** Tier is what changes how a wave must be answered
  (`contacts.ts`), so it gets the silhouette. Basic, elite and specialist use
  three distinctly-shaped sprites, asserted by test. Per-craft art is Phase 38's,
  and must not lose the tier read to get it.
- **One dominant shape per sprite.** A blob with three appendages reads at 20px;
  a detailed hull does not.
- **Test at size, on the background, in motion.** Not in a viewer at 400%.

## 6. VFX readability

PLAN.md Phase 37 asks for rules "so bullets stay readable against backgrounds".
The failure mode this prevents is specific and fatal to a bullet-pattern game:
the player cannot tell what will hit them.

1. **Incoming fire is the brightest thing on screen.** Nothing owned, ambient or
   decorative may out-contrast a hostile projectile against `--bg`. Phase 39's
   backgrounds are capped accordingly — low contrast, and never in the hostile
   hue range.
2. **A projectile is one solid shape with a hard edge.** No soft glow doing the
   work of the silhouette; a glow may only ever be additive on top of a shape
   that already reads without it.
3. **Nothing hostile is transparent.** Alpha is for things leaving — a fading
   tracer, an expiring popup. A semi-transparent bullet is a bullet the player
   may not see over a bright background.
4. **Effects never occlude what they are about.** The tracer layer sits *under*
   the projectile layer for this reason: the cheapest thing on screen must never
   cover the one thing that has to be read.
5. **A telegraph is drawn, not implied.** A pattern that fires without warning
   is a bug, and the warning belongs to the render layer where it cannot be
   optimised away.
6. **Every effect has a bounded lifetime and a fixed-capacity pool.** The feed
   is 64, tracers are 64. A burst that would produce hundreds of anything drops
   the overflow — unreadable is unreadable, and legibility is the cap's first
   justification, performance only its second.
7. **Motion is the last channel, not the first.** Screen shake and reduced
   motion are player settings (Phase 43); nothing may depend on movement to be
   understood.

## 7. Open, and owned by later phases

- **Contacts share three sprites across ten craft, Platforms four across ten.**
  Interim, and better than the identical circles they replaced. Phase 38.
- **No animation yet.** The pipeline loads single textures; frames, atlases and
  an animation clock are Phase 38's, and Phase 39's atlasing is what makes them
  affordable.
