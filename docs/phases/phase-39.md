# Phase 39: Environment & Zone Art

**Stage 5 — Art & Audio**
Output: `content/backdrop.ts`, `core/backdrop.ts`, a backdrop layer in
`render.ts`, `tests/backdrop.test.ts`, art-style.md §8

## Checklist

- [x] A per-zone background, with parallax
- [x] Low contrast, so backgrounds never compete with bullet patterns
- [x] Optimised for web delivery, with the total watched rather than assumed
- [n/a] Tilesets — see below

## Two of the asks do not fit the game, and one does not fit it *yet*

PLAN.md asks for "parallax backgrounds and tilesets per zone". **Tilesets have
no meaning here**: the arena is a fixed disc, there is no ground, and nothing
scrolls. A tilemap would be a system with nothing to tile.

**Parallax needed translating rather than dropping.** Parallax is the appearance
of depth from differential motion, and this game's motion is rotation — the
rings turn, the field does not scroll. So the layers turn too, the further ones
slower, which is exactly what distance does to apparent motion. It is the same
effect derived from the same principle, expressed in the geometry the game
actually has.

**Atlasing has nothing to pack.** See "Delivery" below; the tripwire is the
deliverable, not the atlas.

## Generated, not painted

The sky is a rule, not an image. Three reasons, in increasing order of how much
they mattered:

1. It costs **no bytes**, in a phase whose brief is to watch download size.
2. It is sharp at any viewport, with no resolution to pick.
3. Its contrast can be **asserted**. §6 rule 1 makes the background the one
   thing that must never compete with incoming fire, and a painted sky can only
   be checked by looking at it — once, by whoever painted it.

`tests/backdrop.test.ts` is that third point cashed out: brightness ceiling,
forbidden hues, a motion ceiling an order of magnitude below the fastest ring,
and nothing drawn inside the playable disc. Thirteen tests, and every authored
number in the table passes through them.

## The ladder darkens outward

The narrative had already decided this. The Service Floor is "the only part of
the Perihelion that looks lived-in"; the Unlit Orbit has "been dark for nine
generations". Leaving a sun means less light, so the sky thins and cools as the
ladder climbs.

It is also precisely what legibility wants. The late zones carry the densest
bullet patterns in the game and they are the zones with the quietest skies — a
busier background on a harder stage would be the worst possible pairing. The
fiction and the readability rule agreeing is the only reason to trust either of
them, and a test holds the ordering so a later tuning pass cannot break it
quietly.

The Veil is the one deliberate exception: dense and dim rather than sparse,
because "nothing is seen through it" describes a sky full of something that
cannot be resolved, not an empty one.

## Tuned by rendering, not by argument

The first pass satisfied every rule above and was **invisible**. Brightnesses of
0.05–0.34, further multiplied down to 60% by the per-star variation, put the
brightest star barely above the background; six zones rendered side by side were
indistinguishable from a blank screen.

It was caught by rendering a real 1280×720 viewport and looking at it — and the
first attempt at *that* was wrong too, drawn at a third of the game's scale, so
it was judging something the player never sees. The fix was more brightness, a
tighter variation floor, and three times the stars, since the coverage disc is
three rim radii and only about a fifth of it is ever on screen.

The lesson generalises past this phase: a contrast rule can only ever tell you
when something is **too loud**.

## Delivery

Measured rather than assumed, which is what the brief asks for:

```
26 sprites, inlined as data URIs   39.5 KB   8.0% of the main chunk
largest single sprite               2.5 KB
backgrounds                             0 B   (they are code)
dist total                            870 KB
```

Inlining is the right trade at this size — zero round trips, nothing to cache
separately. It stops being right once frame sets land: base64 inflates by a
third, the main chunk is parse-blocking, and inlined art cannot be split per
zone. A full frame set is on the order of 320 frames and would roughly double
the JavaScript needed to start playing.

So the deliverable here is a **tripwire**, not an atlas: `tests/assets.test.ts`
fails when the payload passes 120KB. Atlasing is due when that fires and not
before — an atlas built for art that does not exist is a guess, and Phase 40's
VFX may change what needs packing.

## Verified

- Stars draw: 181 lit pixels in a 300×200 corner of a live field.
- The playable disc stays clear, by construction and by test.
- The layers rotate: a fixed window's contents change across ten simulated
  seconds.
- 0.51 ms per frame for simulation and render together, against 16.7 ms — the
  geometry is built once per zone and only a rotation is written per frame.
- 939 tests, `npm run check`, and a production build all green.
