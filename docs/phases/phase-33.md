# Phase 33: Stage / Zone Structure

**Stage 4 — Content Production** (final phase)
Output: `content/zones.ts` (six zones, forty stages), `progression/map.ts`,
`ui/StageSelect.svelte`, `tests/zones.test.ts`

## Checklist

- [x] A progression map themed to the setting
- [x] Stage-select UI with unlock gating
- [x] Each zone populated with its Contact subset
- [x] **Bosses reachable** — the problem Phase 32 left behind

## The reachability problem, and how it is resolved

Phase 32 shipped five bosses that nothing could reach, for a structural reason
rather than an oversight: boss stages fall on `SCALING.bossInterval` — every 8th
scaling index — while narrative.md assigns each boss to a **zone**. Those are
two different coordinate systems, and with three-stage zones they never
coincided.

Resolved by laying the ladder out so the two agree exactly, rather than by
moving the interval — the interval is load-bearing elsewhere (economy-spec.md §3
puts the first Rewind at roughly stage 8, and the Almanac reveals on a first
boss clear).

| Zone | Stages | Boss |
|------|--------|------|
| 1 The Service Floor | 1–4 | — |
| 2 The Fast Orbit | 5–8 | The Backlog, at 8 |
| 3 The Veil | 9–16 | The Sympathetic, at 16 |
| 4 The Home Orbit | 17–24 | Long Wear, at 24 |
| 5 The Cold Line | 25–32 | The Blank Page, at 32 |
| 6 The Unlit Orbit | 33–40 | The Dark Watch, at 40 |

Every boss is now the **last stage of its zone**, which is both what
narrative.md describes and what the interval produces. Zone 1 has no boss, also
as narrative.md has it.

The two short zones at the start are deliberate. Eight stages of preamble would
put the first boss outside a first run, and with it the Almanac.

**Demonstrated, not assumed.** A walk of the whole ladder that only ever enters
the stage the map says is next, and only when the rules allow it:

```
stage  8  BOSS the-backlog      +15 clearance  +400 salvage
stage 16  BOSS the-sympathetic  +15 clearance  +500 salvage
stage 24  BOSS long-wear        +15 clearance  +650 salvage
stage 32  BOSS the-blank-page   +15 clearance  +850 salvage
stage 40  BOSS the-dark-watch   +15 clearance  +1200 salvage

walked 40 of 40 stages · zones unlocked 6 of 6 · unreached zones: none
```

Three tests pin it: a boss on every interval stage **and nowhere else**, every
boss at its zone's end, and every authored boss placed exactly once.

## The other dead configuration

`ZoneDef.requires` and `meta.unlockedZones` have both existed since Phase 8. The
field was declared, the save carried the array, and **nothing ever added a zone
to it.** Every zone past the first was permanently unreachable — and nothing
noticed, because until this phase there was no second zone to notice it with.

`progression/map.ts` is where that now lives, as pure functions over the save
like the rest of `progression/`. `applyStageClear` calls
`unlockReachableZones`, because a zone unlock is part of what a clear *is*
rather than something a caller must remember.

It loops rather than unlocking one step, so a save repaired or migrated from an
older build cannot end up short of what it earned. A test clears three zones,
resets the unlock list to just the first, and asserts all three come back.

## Zone character

Each zone leans on a different wave shape, so a zone asks a question rather than
raising a number:

- **1 Service Floor** — `scattered`, `escorted`. Coverage and priority.
- **2 Fast Orbit** — `massed`. One arc at a time.
- **3 The Veil** — `pincer`. Both sides at once.
- **4 Home Orbit** — `guarded`. Wardens, so killing order starts to matter.
- **5 Cold Line** — everything, mixed.
- **6 Unlit Orbit** — the same, denser, on the deepest indices.

This also closes two items carried since Phase 30: `massed` and `pincer` were
authored wave shapes with no content using them, and they were the situations
Transit and Corona were built for. Both are now zone identities.

## Three guards fired while authoring

All three were tests written in earlier phases, catching content written in this
one — which is the whole reason they exist.

**The Veil spawned Wardens it never declared.** The Phase 31 `enemyPool` guard
caught it. That field had been unread for twenty phases before Phase 31 gave it
a job; this is the first time it earned its keep.

**Stage 4 opened softer than stage 3.** The monotonic-HP-rate guard rejected a
Lance escort — a Lance is fast and frail, and swapping a Shell for one made the
zone's fourth stage open easier than its third. Now a Hulk escort.

**A Salvage-sink assertion was calibrated against a three-stage zone.** Growing
zone 1 to four stages nearly doubled its yield and the "twentieth slot must stay
out of reach" check failed. That one was the *test* being wrong rather than the
content: an invariant about the shape of the cost curve should not fail because
a stage was added. Rephrased against the curve — `total(20) / total(10)` — with
a much looser tie to zone yield kept alongside it.

## The stage-select panel

Opens with **M**. Reads a projection built by `progression/map.ts`, not
assembled in the template: which stages are enterable is a progression rule, and
a rule living in a Svelte template is a rule nothing can test.

Locked zones are **shown, not hidden** — named, with their stage counts
withheld. A player should be able to see there is more out there; hiding it
turns a ladder into a corridor and removes the reason to finish the zone they
are on.

The picked stage is a *request* on the store, consumed by bootstrap, and
**re-validated against the save** before it is honoured. The panel disables
locked stages, but a disabled button is a presentation detail and the rule lives
in `progression/`.

Verified in the browser: the panel lists all six zones with five locked, shows
2/4 on the zone in progress, and switching to First Shift rebuilt the simulation
and updated the HUD. One flaw found and fixed there — clicking the stage already
in play left the panel open with no feedback, which reads as a click that did
not register.

## The Clearance budget, now that the ladder exists

Walking all forty stages yields **120 Clearance**: 35 first clears at 1, five
boss clears at 5, six zone completions at 10. Full roster breadth costs 89 — 61
for the ten Platforms, 28 for the five Arrays — leaving 31 for levelling.

That is deliberately not enough to max everything on one pass, which is what
`ROSTER.maxLevel` of 10 per unit is priced against. Whether the remainder is the
*right* 31 is a Phase 35 question.

## Test coverage

822 passing; 34 added — zone names transcribed from narrative.md in order, every
zone epigraphed, the scaling index continuous from 1 to 40, the `requires` chain
complete, ids and stage names unique, difficulty rising outward, all forty
stages loading through the real loader, the three boss-reachability guards, the
first boss inside a first run, zone unlocking on full clear and not on partial,
multi-zone catch-up, idempotence, survival across a Rewind, stage gating within
a zone, cleared stages staying open, unknown addresses refused, `nextStageFor`
walking forward and crossing zone boundaries and never returning null, and the
map view's ordering, boss marks and progress counts.

## Stage 4 complete

Phases 29–33 are done. The content the game runs on now exists: ten Platforms,
five Arrays, ten Contacts, five bosses, six zones, forty stages, and a map that
connects them.

## Carried forward

| Phase | Item |
|-------|------|
| 34 | The Almanac's full ~72 nodes; twelve exist |
| 35 | The whole ladder is unmeasured past about stage 16 — the player model breaks down there, and bosses 2–5 have never been evaluated at their real depths |
| 35 | 31 Clearance left for levelling after full breadth; whether that is the right remainder is a tuning question |
| 36 | The map has no "recommended next" marker and no zone art; a tutorial should probably open it once |
| 37 | Six zones want six visual themes; `ZoneDef` has no field for one yet |
