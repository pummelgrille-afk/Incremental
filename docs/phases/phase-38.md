# Phase 38: Character & Enemy Sprite Production

**Stage 5 — Art & Audio**
Output: `core/animation.ts`, frame discovery in `core/assetLoader.ts`,
animated bodies in `render.ts`, `tests/animation.test.ts`, art-style.md §7

## Checklist

- [x] An idle/attack/hit/death animation system, referenced from `content/*.ts`
      by asset key
- [x] Silhouette rules held frame by frame (art-style.md §5 and §7)
- [ ] **The frames themselves** — see "What this phase cannot do"

## What this phase cannot do

Draw. PLAN.md asks for "idle/attack/hit/death animation sets ... all original
designs", and no frames have been produced, so the checklist item stays open and
every clip in the game is still one frame long.

What is done is everything *around* the frames: a unit's state machine, a frame
clock, discovery by naming convention, per-state fallbacks, and the render
integration — all of it exercised end to end. Dropping a file called
`bolt-attack-1.png` into `src/assets/sprites/raw/` and re-running the normaliser
is the entire remaining step per frame. There is no wiring left to do.

That order was deliberate rather than an excuse. The alternative — art first,
system afterwards — means authoring frames against a contract nobody has tested,
and discovering the attack budget is six frames after drawing ten.

## The state machine is not in the renderer

`core/animation.ts` is pure functions over numbers: no Pixi, no DOM, no
simulation. The render layer asks "which state is this unit in, and which frame
of it", and both answers are testable in a plain Vitest process.

That matters because *when* a unit looks like it is attacking is exactly the
kind of rule that goes subtly wrong and cannot be seen going wrong. Nineteen
tests pin it, including the two cases that would otherwise be discovered by eye
months later: a one-shot clip must hold its last frame, and a unit with no
attack clip must never enter the attack state.

**No new simulation state was invented for it.** Every input is a scalar the
simulation already computed:

| State | Contact | Platform |
|-------|---------|----------|
| `hit` | `hitFlash` | `hitFlash` |
| `attack` | `telegraphRemaining` | cooldown still near its ceiling |
| `death` | — | `disabledFor` |
| `idle` | otherwise | otherwise |

A Platform's attack is derived rather than signalled: the cooldown is reset to
the full interval the moment a unit fires, so a cooldown near its ceiling means
it fired within the last fraction of a second. A `justFired` field would have
been a second clock for the simulation to keep in step for the renderer's sake.

A Contact's attack is the **telegraph**, not the moment the projectiles leave.
combat-spec.md §6 makes the warning mandatory, so the wind-up does the same job
as the ring the overlay already draws, rather than adding a later cue that says
nothing new.

## Two small additions to the simulation

**`PlatformInstance.hitFlash`**, which a Contact has carried since Phase 17 and
a Platform never had, for the same reason it was absent there: nothing had asked
for it. Presentation only — no system reads it, and a renderer ignoring it would
change nothing about a fight. Decayed above the disabled branch in
`updatePlatforms`, or a flash would still be lit when a unit came back twelve
seconds later.

**`CombatEvent.spriteKey`**, so a death can be animated at all. A Contact is
removed from the field the instant it dies — `reapContact` filters it out — so
by the time anything could draw it, the entity and its def are gone. The feed
is the one thing that outlives a kill; it was built to, so a kill popup could
survive the death that produced it, and a key is the smallest thing that lets
the render layer finish the job.

## Frames are ordinary sprites

`<key>-<state>-<n>.png`, discovered once at module load, travelling the same
`raw/` → normaliser → manifest → bundle path as everything else. No atlas
format, no metadata file, no second pipeline.

The fallbacks are what make it possible to ship art one clip at a time: a state
with no frames uses idle, and idle with none uses the bare key. So a unit can be
given an attack animation without also owing a death, and every unit wired in
Phase 37 keeps working untouched.

## Exercised, not assumed

Two throwaway frames were staged under one clip — deliberately two *different*
sprites, so a frame change is unmistakable — and the field sampled six times at
one-frame intervals:

```
venus 1257  mercury    0
venus 1251  mercury    0
venus  409  mercury  405
venus 1249  mercury    0
venus  409  mercury  410
venus 1250  mercury    0
```

The textures swap. The mixed samples are the four Platforms drifting out of
phase with each other, because each one's clock restarts when it attacks — which
is the behaviour wanted: a rack of units bobbing in perfect unison would look
like one object.

The frames were deleted afterwards. Committing placeholder art would have made
the checklist item above look done.

## One bug the writing found

Explaining the workflow surfaced a defect in the Phase 37 normaliser: it trims
each image to its own bounds. Correct for single sprites, wrong for frames — a
frame two pixels narrower is centred and scaled differently, so a stationary
unit shuffles on the spot, and the renderer sizes a sprite once from its idle
frame and swaps textures underneath that scale.

It now groups files by **unit** and crops the group to the union of its bounds.
Checked with two frames of deliberately different extent — one planet at full
size, the same planet at 70% — which come out at identical dimensions. The ten
existing sprites are byte-for-byte unaffected, each being a group of one.

## What is needed to close this phase

Frames, to art-style.md §7's contract. In rough order of what the game gains
most from:

1. **`contact-2` idle** (basic tier, the craft the player sees most) — 2–4
   frames. This alone makes the field feel alive.
2. **`contact-1` / `contact-2` / `contact-3` death** — 3–6 frames each. The
   biggest single readability gain: a kill currently just stops existing.
3. **Platform attack** for the four planets — up to 6 frames each.
4. **Hit** for anything, 2–3 frames. Lowest value; the tint already reads.

Per-unit art rather than per-category is the phase's real goal — ten Contacts
share three sprites and ten Platforms share four. That is a much larger ask, and
the tests pin the categories apart so it cannot quietly lose the tier or type
read while gaining detail.

Arrays have no art and no `assetKey`, and are the one gap that is not just
missing frames: nothing damages them, so `hit` and `death` would be dead clips
regardless.
