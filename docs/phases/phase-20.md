# Phase 20: Combat Balancing & Telemetry Pass

**Stage 2 — Core Combat Systems** (final phase)
Output: `systems/telemetry.ts`, a dev-only readout in the F2 overlay,
`tests/telemetry.test.ts`, a retuned stage 2

## Checklist

- [x] Dev-only telemetry: time-to-clear, deaths, DPS per ally
- [x] Gated behind `import.meta.env.DEV`, verified stripped by a real build
- [x] Balance pass against balancing.csv as ground truth
- [x] "The Beat is optional" — re-verified with stage-appropriate formations

## Telemetry

A sink, never a source. Nothing in the simulation reads a value back out, which
is what licenses recording at all — the same argument as `systems/feed.ts`, and
a test asserts two runs from one seed produce identical outcomes with it on and
off.

**Attribution is by definition id, not instance.** Two Hammers are one row. The
question this answers is "is a Hammer worth its cost", which is a content
question; per-instance numbers would only measure which slot got lucky.

**DPS divides by unit-seconds, not wall clock.** A unit slotted halfway through
a stage would otherwise read as half as good as an identical one present
throughout, which says nothing about the unit.

`sourceDefId` now rides on the projectile rather than being resolved at impact.
The firing unit can be dead by the time its shot lands, so a lookup would be an
O(n) scan for something that no longer exists.

### The strip test found a trap

`createTelemetry` is `import.meta.env.DEV ? new Telemetry() : null`. Vite folds
the condition to a literal, `Telemetry` loses its only reference, and rollup
drops the class. Verified by building and asserting the bundle contains none of
`unitSeconds`, `damageDealt`, `damageTaken` — and verified to be a *real* test
by removing the gate and watching it fail.

Getting there cost one false alarm worth recording. **Vitest runs with
`NODE_ENV=test`, and a build launched from inside a test inherits it**, which
makes Vite treat the build as non-production and define `import.meta.env.DEV` as
**true**. The ternary then folds the wrong way and the class ships. The test now
forces `NODE_ENV=production`; without that it reports a failure that does not
exist in the shipped build.

What is *not* stripped: the `sim.telemetry?.…` call sites, which become no-ops,
and two string constants. Removing those too would mean wrapping every call site
in its own `import.meta.env.DEV` block, which is not worth the noise.

The test also caught a second, subtler leak immediately: the store's telemetry
readout filtered on `row.stats.damageDealt > 0`, and that property name reached
the bundle even though the class did not. Switched to `row.share > 0` — the same
predicate, without naming a collector field outside the collector.

## What the numbers say

Stage-appropriate formations, with the Beat, share of total damage:

| Source | First Shift | Routine | Noted |
|---|---|---|---|
| Hammer | 36% | 17% | 27% |
| Pallet | — | 28% | 26% |
| **Conjunction** | **24%** | **17%** | **29%** |
| The Beat | 21% | 24% | 11% |
| Quarter-bell | 12% | 10% | 6% |
| Detent | 7% | 4% | 0% |

Two things worth acting on later:

**Conjunction is carrying 17–29% of all damage.** The signature mechanic is not
decorative — it is a top-two damage source on every stage. That is a good result
for P3, and it means Phase 29's roster cannot treat `conjunctionEffect` as
flavour.

**Detent contributes 0–7% of damage and takes no disables while Hammer and
Pallet take 1.5 and 1.0.** The tank survives and the damage dealers do not,
which means it is not protecting them — damage is distributed by position, not
by aggro, so a tank only tanks what happens to arrive in its arc. That is a
roster design question, flagged for **Phase 29**, not a tuning one.

## "The Beat is optional" — verified, finally

Phase 17 recorded this as *partially unverified* and committed to re-checking it
here, with the promise that **if it still failed, density would come down**.

| Stage | Formation | With Beat | Without | Losses |
|---|---|---|---|---|
| First Shift | 5 units | 0.892 | **0.672** | 0/24 |
| Routine Maintenance | 7 units | 0.903 | **0.421** | 0/24 |
| Noted in the Log | 11 units | 0.929 | **0.894** | 0/24 |

Phase 17's failure *was* largely the confound it suspected: one frozen six-unit
build for every stage conflates "this stage is too hard" with "this is the wrong
build for this stage".

But not entirely. **Routine Maintenance still failed at a stage-appropriate 7
units** — 14 losses in 24 without the Beat. It was also the densest stage in the
zone at 89 Slack, *denser than stage 3's 71*, which is a content bug independent
of any formation assumption: Phase 17 had held stage 3 back because of the knife
edge, and never brought stage 2 down to match.

Density came down, as promised: 89 → 69, restoring a monotonic count ramp of
**42 / 69 / 71**.

## The one thing this phase could not settle

Stage 3's content, measured against two formations:

| Formation | With Beat | Without Beat |
|---|---|---|
| 11 units (assumed) | 0.929 | 0.894, 0 losses |
| 7 units | 0.399 | **lost 13 of 16** |

The same content is a walkover or a wipe depending entirely on how many units
the player has. **So stage 3 was deliberately left alone.** Tuning it now would
be fitting content to a number I invented — the ladder is an estimate from
economy-spec.md §6's unlock schedule, and nothing more.

Stage 2's fix does not depend on that estimate, which is why it was safe to
make: stage 2 failed relative to *its own neighbours* under one consistent
ladder, and was the densest stage in the zone by raw count.

**Phase 24 replaces the estimate with the real economy, and the table in
combat-spec.md §1 must be re-measured then.** That is now recorded in the spec
rather than left as an intention.

## Test coverage

419 tests passing; 21 added. Attribution by definition, unit-seconds DPS,
ranking and shares, the Beat and conjunctions recorded as their own sources,
Mainspring damage taken, disables, wave records, time-to-clear, telemetry never
altering an outcome, a full stage running with the collector absent, overkill
not being credited, and the production strip.

## Stage 2 complete

Phases 11–20 are done. The combat system is feature-complete against
`combat-spec.md`: rings, the Beat, auto-battle, conjunction with type pairing,
Chimes, six bullet patterns, authored hurtboxes, buffs, a difficulty director
and telemetry.

## Carried forward

| Phase | Item |
|-------|------|
| 24 | Re-measure the Beat-optional table with the real economy; the ladder here is an estimate |
| 24 | Stage 3's density, which cannot be settled without it |
| 29 | Detent tanks nothing — damage is positional, not aggro-based |
| 29 | `conjunctionEffect` is load-bearing at 17–29% of damage, not flavour |
| 32 | Boss telemetry will want phase-by-phase splits |
| 46 | Re-measure performance on real low-spec hardware |
