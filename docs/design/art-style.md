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

`tools/derive-clips.py` is a second producer into the same `raw/` directory. It
writes **death** frames by transforming a unit's own art — lighting it, breaking
it into blocks and throwing them outward — and nothing else. A death is not a
new drawing of a craft, it is that craft coming apart, so it is the one clip a
transformation can honestly produce. `idle` and `attack` need a hand and the
tool does not attempt them.

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

### The library

Numbers live in `content/effects.ts`, read by the systems that emit and never
hardcoded in one. That matters more for effects than elsewhere, because these
are the numbers most likely to be nudged by eye — and a number nudged by eye
inside a system is a number nobody can find again.

| Effect | Emitted by | Says |
|--------|-----------|------|
| Conjunction | `systems/synergy.ts` | the formation paid off — scaled by participants |
| Impact | `systems/collision.ts` | a shot landed here |
| Block | `systems/collision.ts` | your block arc worked, which is a good outcome |
| Flare sparks | `core/loop.ts` | how wide the blast actually was |
| Upgrade | `core/bootstrap.ts` | something was bought, played once the panel is shut |

Colours come from the same damage-type table as the unit body and its tracer, so
three separate places say the same thing about a type and none of them can
disagree.

### Rule 8: an effect's cost is its frequency, not its size

The conjunction burst was authored at 14–38 particles, which looks modest until
you measure how often it fires: a full formation of 48 Platforms conjuncts
roughly **36 times a second**, and the effect cost 881 particles a second
against a budget of 400. It emptied the field on the opening stage, and nothing
failed — the pool discards overflow silently, so an exhausted field looks like
effects that stop appearing.

The fix was to emit **once per evaluation** rather than once per conjunction,
taking the largest. At a 100 ms cadence the eye reads one event anyway, so the
other 35 bought nothing but overflow. Peak across the whole ladder with a
maximum formation went from *exhausted* to 167–188 of 400.

Before adding an effect, multiply its count by how often the *worst* build fires
it. `tests/particles.test.ts` does this against a full field on the first and
last boss.

## 7. Animation

Frames are ordinary sprites under a naming convention, not a new kind of asset:

```
<key>-<state>-<n>.png      bolt-attack-1.png, contact-2-death-3.png
```

1-based, no zero padding, and they go through the same `raw/` → normaliser →
manifest → bundle path as everything else. A unit with no frames at all keeps
using its bare `<key>.png`, so nothing has to be authored to keep working.

**Four states, and each one is a question the field has to answer.**

| State | Plays | Frames | Shown when |
|-------|-------|--------|------------|
| `idle` | loops, 0.16s/frame | 2–8 | nothing else applies |
| `attack` | once, 0.05s/frame | **≤ 6** | a Contact is telegraphing; a Platform has just fired |
| `hit` | once, 0.05s/frame | 2–4 | damage landed |
| `death` | once, 0.09s/frame, holds last | 3–8 | a Contact died; a Platform is disabled |

Two of those numbers are constraints rather than suggestions:

- **Six attack frames, maximum.** Rake attacks every 0.65s and haste cuts it
  further, so a wind-up has about a third of a second before the next one
  starts. A clip that cannot finish reads as a stutter rather than as an
  action. `tests/animation.test.ts` holds the budget against the fastest
  authored interval, so raising it means faster frames or a slower roster.
- **Idle is slow on purpose.** It is on screen permanently, and a fast idle
  reads as agitation rather than as life.

**Every frame of a unit is trimmed to one shared box.** The normaliser groups
files by unit — `bolt.png`, `bolt-idle-1.png` and `bolt-attack-3.png` are one
group — and crops them all to the union of their bounds. Trimming each frame to
its own bounds, which is what a single-image pipeline naturally does, makes a
stationary unit shuffle on the spot: a frame two pixels narrower is centred and
scaled differently. This is also why frames may be drawn on a full canvas
without care for margins; the tool finds the box.

**States fall back rather than failing.** A state with no frames of its own uses
idle; idle with none uses the bare key. So art can arrive one clip at a time —
give a unit an attack animation without owing it a death — and nothing has to
land as a complete set.

**A death is drawn from the combat feed, not from the entity.** A Contact is
removed from the field the instant it dies, so by the time anything could draw
it, the entity and its def are gone. The feed outlives the kill and carries the
sprite key for this reason.

Things a clip must not do:

- **Do not move the unit.** Position is the simulation's. A frame that walks
  the art across the cell desynchronises the sprite from its own hitbox. Small
  motion *within* the box — a bob, a recoil, a limb — is the point; travel is
  not.
- **Do not change the silhouette's read.** §5 still applies frame by frame: a
  unit must be identifiable on any frame of any clip, including mid-death.
- **Do not encode a number.** §4 still applies. A health-shaded death frame is
  a readout, and the overlay owns those.

## 8. The background

**Generated, not painted.** The sky is a rule in `content/backdrop.ts` and
`core/backdrop.ts`, not an image: it costs no bytes, it is sharp at any
viewport, and — the reason that matters most here — its contrast can be
*asserted* rather than eyeballed. §6 rule 1 makes the background the one thing
that must never compete with incoming fire, and `tests/backdrop.test.ts` is that
rule made executable.

Four constraints, all tested:

| | Rule | Why |
|---|------|-----|
| Brightness | ≤ 0.5 alpha | Lands near 0.3 luminance; hostile green sits near 0.7 |
| Hue | never within 45° of the hostile green, or 30° of telegraph red | A shared hue must be ruled out before the field can be read |
| Motion | < 4.5°/s, an order below the fastest ring | A backdrop you can watch move is competing for attention |
| Position | nothing inside 1.05 × the rim | The playable disc is where the player is looking; no dimming makes a distractor there acceptable |

**Parallax is rotational**, because that is how this game moves. Nothing
scrolls — the arena is fixed and circular — so the layers turn instead, the
further ones slower, which is what distance does to apparent motion.

**The ladder darkens outward.** The Service Floor is "the only part of the
Perihelion that looks lived-in"; the Unlit Orbit has "been dark for nine
generations". Leaving a sun means less light. It is also what legibility wants,
since the late zones carry the densest patterns — the fiction and the rule
agreeing is the only reason to trust either.

The Veil is the deliberate exception: dense and dim rather than sparse, because
"nothing is seen through it" describes a sky full of something you cannot
resolve, not an empty one.

### Tuned by rendering, not by argument

The first pass at these numbers satisfied every rule above and was **invisible**
— the brightest star sat barely above the background. It was found by rendering
a real 1280×720 viewport and looking, not by reasoning about the values, and the
lesson generalises: a contrast rule can only tell you when something is too
loud.

### Delivery

At 26 sprites and no background images, Vite inlines the entire art payload as
data URIs — 39.5KB, 8% of the main chunk, zero round trips. That stops being the
right trade once frame sets land: base64 inflates by a third, the main chunk is
parse-blocking, and inlined art cannot be split per zone or cached apart from
the code. A full frame set is on the order of 320 frames and would roughly
double the JavaScript needed to start playing.

`tests/assets.test.ts` holds a 120KB tripwire on the payload so that decision is
forced by a number. Atlasing is due when it fails and not before — an atlas
built for art that does not exist is a guess.

## 9. Open, and owned by later phases

- **Contacts share three sprites across ten craft, Platforms four across ten.**
  Interim, and better than the identical circles they replaced. Awaiting art.
- **Only `death` is animated**, and derived rather than drawn. `idle`, `attack`
  and `hit` are one frame each; §7 is the brief for filling them.
- **No atlas.** Ten sprites inline into the bundle; a hundred frames will not.
  Phase 39 owns atlasing, and it is what makes a full frame set affordable.
- **Arrays have no art at all** and no `assetKey`. They also never take damage —
  nothing writes their HP or `disabledFor` — so `hit` and `death` would be dead
  clips today regardless.
