# Phase 29: Platform Roster — Wave 1

**Stage 4 — Content Production** (first phase)
Output: `content/platforms.ts`, `tests/platforms.test.ts`, plus the solar reskin
this phase was scheduled to carry (`theme-revision.md`).

## Checklist

- [x] 8–12 launch units with distinct roles (tank, DPS, support, control),
      original to the world, defined against the `Platform` interface
- [x] Balanced against the Phase 6 economy model
- [x] **The theme revision, folded in** — `theme-revision.md` scheduled naming
      for Phases 29–33 and this is 29
- [x] Fourth orbit, from the same spec
- [x] Save schema 5 → 6

> **Superseded terms.** PLAN.md calls these "allies" and the file
> `content/allies.ts`. Both were renamed this phase. The checklist above is the
> original ask; only the nouns moved.

## Two jobs in one phase

This phase was always going to be the roster. It became the reskin as well
because those are the same work: every unit authored here gets a name, and
naming ten units in a vocabulary about to be replaced would mean naming them
twice. `theme-revision.md`'s schedule said "all naming lands here", and it was
right.

The order mattered. Landing the rename *first* meant the roster was authored
once, in its final vocabulary. Landing the roster first would have meant
authoring Hammer, Detent and eight siblings and then renaming eleven units.

Two commits:

1. **The fourth orbit** — structural, and no vocabulary in it. Genuinely
   separable, and separated.
2. **The reskin and the roster together.** These were planned as two and could
   not be split: the schema 5 → 6 migration maps `hammer` → `bolt`, so the
   rename commit's own tests do not pass until the roster it renames *to*
   exists. Splitting them would have meant one commit with failing tests, which
   is worse than one commit that is honestly large.

## The roster

Ten Platforms. Bolt, Anchor and Rake are the Phase 10 starter set **renamed with
their numbers untouched** — those were tuned across Phases 10 to 20 against
measured clear rates, and re-tuning them in the same commit that adds seven
unmeasured units would have destroyed the only baseline available for judging
the seven.

| | Role | Type | Cost | Exists for |
|---|------|------|------|-----------|
| Bolt | damage | percussive | 0 | The opening grant |
| Anchor | tank | percussive | 2 | Block arc |
| Rake | damage | shear | 3 | Rate, against quantity |
| Ember | damage | thermal | 4 | An early answer to `seized` |
| Ballast | tank | shear | 5 | A tank that covers `massed` |
| Lantern | control | resonant | 6 | The widest arc in the roster |
| Kiln | damage | thermal | 7 | Hit *size*, against `shieldHits` |
| Spar | control | percussive | 9 | The only two-orbit reach |
| Tuner | support | resonant | 11 | Zero attack; repairs the line |
| Relay | support | resonant | 14 | The largest pulse, on the weakest body |

61 Clearance total against a zone's fixed yield of 13, so breadth arrives across
Phase 33's zones rather than from zone 1 — which is what first-clear-only
currency is for.

## The roster exists to light up dead configuration

Four things were declared and unreachable. Dead configuration is where this
project keeps finding bugs, so each one now has a live user, and each is
asserted against its own type union rather than a hand-written list — declaring
a fifth role and forgetting to author one fails the test.

- **`thermal`** was the only `DamageType` nothing dealt, and it is the *sole*
  favourable answer to `seized` armour. A Hulk could only ever be fought at
  neutral. Ember and Kiln deal it.
- **`control`** and **`support`** were `UnitRole`s with no members.
- **`targeting: 'none'`** was handled in `ai.ts` and used by nothing.
- **`repair`** was deleted from `ConjunctionEffect` in Phase 18, with a note
  saying it could return "when Phase 29's roster is large enough to carry a
  healer". It did.

`repair` is the one conjunction effect that reaches **past the unit that brought
it**: it heals every participant. That is deliberate and it is what makes
support a role rather than a label — a Tuner deals no damage at all, so a
self-only heal would leave it contributing nothing to anybody.

## A test caught a unit that was strictly worse than free

Ember's first draft: 50 HP, 11 attack, 3 defence, 1.0 s interval, 30° reach, 10°
block, 20 pulse — **lower than the free Bolt on every single stat**, at a price
of 4 Clearance. Its only advantage was its damage type.

That is a trap rather than a choice. A favourable type is a reason to *field* a
unit in one matchup; it is not a reason to *buy* one that loses in all the
others. Ember is now quicker and wider than a Bolt and frailer than it, which is
a trade. The guard is `never charges more for a weaker unit than the free one`,
and it will fire again the next time a tier-1 unit is drafted carelessly.

## The reskin, in brief

Full record in `theme-revision.md` §Outcome. The parts worth repeating:

**The vocabulary pass was ~3,400 occurrences across ~90 files**, and the first
attempt was wrong in an instructive way. `\bMovement\b` does not match
`MovementDef`, `movementById` or `MOVEMENTS`, so word-boundary matching renamed
prose and standalone identifiers and left every compound behind — and the result
still compiled. Reverted and redone with plain substring replacement, which is
correct for nouns this distinctive.

**`key` could not be scripted at all** — `slotKey`, `keyframes`, `Object.keys`,
`onkeydown`, `assetKey` are all unrelated to the currency. Keys → Clearance was
done by targeted replacement, and the declarations were deliberately left for
the compiler to find.

**The historical migrations had to keep their old vocabulary.** The blanket pass
rewrote migrations 1→5 to say `salvage` and `arrayUpgrades`. That is wrong: a
migration that produces a *version 4* save must write the names version 4
actually used. Renaming them would make them lie about what they produce, and
the next migration to read one of those fields would find nothing there.

## The fourth orbit

Radius 310, 18 slots, period 34 s. Mars's true period would be ~62 s — longer
than most waves last, so the outer orbit would read as static. 34 s holds
8 : 14 : 22 : 34 = 4 : 7 : 11 : 17, pairwise coprime.

**A Grand conjunction is now reachable at all.** Same-orbit units are excluded
from conjunction by design, so with three orbits four participants was
arithmetically impossible rather than merely rare. Measured over two simulated
hours with one platform per orbit: ~3 Grands at base tolerance, ~10 with the
Regulation branch invested. Rare, and it gives Regulation a headline effect it
did not have.

The period sweep found **a hole in the coprime guard**: 8 and 32 passed every
assertion — they reduce to 1:4, coprime and above the "not tiny" floor — while
sitting in exact 4:1 lockstep and never drifting apart. The test existed to
catch exactly that and was waving it through. Neither reduced term may now be 1.

A sixth hardcode site the spec's list of five had missed:
`ui/FormationEditor.svelte` kept its own radius table with no entry for a fourth
ring, so every slot on it would have been positioned at `NaN`.

## Schema 5 → 6

The largest migration so far and the only pure rename. It carries **both
halves** — the persisted field names, and the content ids stored inside them.

The second half is the one that is easy to forget and silent when missed:
renaming only the fields would leave a formation full of ids like `detent`
resolving to nothing, and those units would disappear from their slots on the
next load with no error anywhere.

### The migration nearly never ran at all

Found by opening the game rather than by a test, which is the part worth
recording. The blanket rename moved the **localStorage key** along with
everything else — `orrery:save` became `perihelion:save` — so the game looked
under a key that had never been written, found nothing, reported a fresh start,
and never reached the migration, because from its point of view there was
nothing to migrate.

Total silent data loss for every existing player. No error, no crash, and
nothing in `notices`. The save file was still sitting in localStorage, intact
and unreferenced, one key away.

Every test passed throughout: they construct a `SaveManager` over a
`MemoryStorage` and plant the fixture under whatever `LIVE_KEY` currently says,
so the key renaming itself moved the tests in lockstep with the code. A test
that imports the constant it is meant to be checking cannot catch the constant
changing.

Fixed by reading the old keys as a last-resort fallback — after the current key
and its backup, so a save under the new key always wins — and by clearing them
on a hard reset, or a reset would appear to work and the old save would return
on the next load. Seven tests now pin this, and they hard-code the literal
string `'orrery:save'` rather than importing it.

`EXPORT_PREFIX` survived by luck: it is `'ORRERY'`, and the rename mapped
`Orrery`, not the uppercase form. It is a wire format — every save string a
player has already exported begins with it — so it is now documented as
deliberately un-renamed.

## Verified in the browser

Against the real save sitting in localStorage from before the reskin — schema 5,
356 Filings, four Hammers, mid stage 2:

- both notices fired: *Migrated save through schema 5 to 6* and *Carried your
  save over from before the system was renamed*;
- the four Hammers came back as Bolts in their original slots, Clearance intact,
  and the stage resolved as `service-floor:routine-maintenance`;
- the field renders four orbits turning at four distinct rates;
- the balance came through as 356 plus the offline award.

One measurement trap worth recording: the Browser pane runs hidden, so
`requestAnimationFrame` never fires and the simulation does not tick. The first
reading showed Output 0/0 and Salvage 0 and looked exactly like the migration
having dropped the balance. It was a stopped clock. Driving `frameStep` by hand
produced the real numbers.

## Test coverage

717 passing; 31 added — the roster's size, uniqueness and unlock curve, every
role/type/targeting policy having a live user, every armour class having a
favourable counter in the roster, repair healing all participants and never
overhealing, the derived orbit bounds, the strengthened lockstep guard, the
5 to 6 migration in both halves including unknown ids passing through untouched,
and the pre-reskin storage key being found, migrated, announced, out-ranked by a
current save, and cleared on reset.

## Carried forward

| Phase | Item |
|-------|------|
| 30 | Array roster — one Array exists (`long-baseline`); 4–6 wanted |
| 31 | Contact roster — six renamed here, tiering still owed |
| 33 | Zone content for the five zones narrative.md now names |
| 33 | Stage-3 density, still tuned against a three-orbit field |
| 34 | The Almanac's full ~72 nodes; twelve exist |
| 37 | Sprite manifest. Art is staged at `src/assets/sprites/`; it needs grid-snapping and quantising first — see `theme-revision.md` §Art |
| 37 | The `--brass` CSS palette is still named for the old setting |
