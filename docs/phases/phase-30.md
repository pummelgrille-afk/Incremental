# Phase 30: Array Roster — Wave 1

**Stage 4 — Content Production**
Output: `content/arrays.ts`, `entities/Array.ts` (`ShotProfile`),
`tests/arrays.test.ts`, swept collision in `systems/collision.ts`

## Checklist

- [x] 4–6 launch support units with clearly different ranged behaviours
- [x] Balanced against the Platform power curve

> **Superseded terms.** PLAN.md calls these "support units" and the file
> `content/supportUnits.ts`. Both were renamed in Phase 29.

## The def had no lever for "clearly different"

`ArrayDef` offered numbers, a targeting policy and a projectile speed. Five
units built from that are five stat lines, not five behaviours — a player would
pick the one with the biggest number and never think about it again.

`ShotProfile` is the one structural axis added for it, kept deliberately small:

- **`single`** — despawns on the first Contact. What every Array did before.
- **`pierce`** — passes through up to N Contacts. Rewards a wave on one bearing.
- **`burst`** — splashes on impact within a radius, at reduced damage. Rewards a
  clustered wave.

A discriminated union rather than optional fields, so a burst cannot be authored
without a radius and a pierce cannot be authored without a count. Both new kinds
arrive with a content user and a behaviour test, because a branch in
`collision.ts` that nothing reaches is the failure this project keeps repeating.

## The roster

| | Targets | Shot | Cost | Better when |
|---|---------|------|------|-------------|
| Long Baseline | highestThreat | single | 4 | always adequate, never ideal |
| Spotter | nearest | single | 3 | leaks are reaching the inner orbits |
| Sounder | deepest | single | 6 | one Contact must die per volley |
| Transit | deepest | pierce 3 | 7 | a wave arrives on one bearing |
| Corona | lowestHp | burst 36 | 8 | a wave arrives clustered |

**Long Baseline's numbers are untouched**, for the same reason Bolt's were in
Phase 29: it is the Phase 14 anchor for `chargeInterval`, *the* lever between
the two unit classes. A test now pins its attack, charge and interval so a
future retune cannot move the thing the measurement was taken against without
noticing.

Everything else is priced against `attack / chargeInterval` — the charge-limited
output, which is what the class is actually gated on. Long Baseline sits at 2.67
and a test caps the roster at 1.15× that.

## Measured, not asserted

Damage per second of charge, against the anchor's flat 2.67:

| | 1 target | 2 clustered | 3 clustered | 3 in a line |
|---|---|---|---|---|
| Long Baseline | 2.67 | 2.67 | 2.67 | 2.67 |
| Spotter | 2.44 | 2.44 | 2.44 | 2.44 |
| Sounder | **2.83** | 2.83 | 2.83 | 2.83 |
| Corona | 1.67 | 2.67 | **3.67** | 1.67 |
| Transit | 2.00 | 4.00 | 4.00 | **6.00** |

Every specialist is *worse* than the generalist against a single Contact, which
is the shape a specialist should have. Corona's crossover is an exact tie at two
and a win from three; the comment in `content/arrays.ts` said "from three
upward" before this was measured, which was right by luck rather than by
arithmetic, and now states the tie.

Over a whole stage-1 clear with the opening four Bolts, averaged across eight
seeds, Output remaining: no Array 634, Long Baseline 774, Transit 754, Corona
750, Spotter 735, Sounder 733. The generalist leads on the general case, as
intended.

**A caveat worth stating plainly:** stages 2 and 3 lose with four Bolts and one
Array regardless of which Array, so only stage 1 discriminates — and stage 1
uses `scattered` waves exclusively, which never cluster and never line up. So
Transit and Corona cannot currently demonstrate their case against authored
content. The `massed` and `pincer` wave shapes that would reward them exist in
`waves.ts` and are unused, held for Phase 33. Until then their value is
demonstrated by the table above and by tests, not by play.

## Two bugs, both found by measuring

**Fast shots tunnelled straight through targets, and this was already
shipping.** The simulation runs at 20 Hz, so a shot at 260 px/s moves 13 px per
tick while the smallest hit window — a 10 px hurtbox plus the 4 px projectile —
is 14 px across. Add an inbound Contact's own speed and the closing distance
exceeds the window, at which point the projectile is on one side before the tick
and the other side after, and never registers. Long Baseline was inside the
margin by 1 px; Phase 30's faster units would have made misses routine.

Fixed by testing the **swept segment** rather than the end point — the closest
approach between the path the projectile travelled this tick and the Contact's
circle. A handful of arithmetic per projectile, and it removes the failure mode
instead of tuning around it. The Contact is treated as stationary at its
post-move position, which is an approximation but strictly closer than the point
test it replaces.

**My own pierce implementation double-hit overlapping Contacts.** The first
version remembered a single `lastHitId`, which is enough while a shot is
crossing one Contact and not enough for two whose hurtboxes overlap: it hits A,
then B, then A again, because by then the "last" id is B. The measurement caught
it immediately — a two-Contact cluster read 6.00 where a two-target pierce
should read 4.00.

The test I had written for this could not catch it, because it used one Contact.
Hit ids are now a fixed-capacity list on the projectile, preallocated so the
pool still never allocates per shot, and the regression test uses two
overlapping Contacts.

I also had a genuinely useless assertion in that file — `expect(dealt)
.toBeLessThan(dealt * 1.5)`, which is true for any positive number. Replaced
with a comparison against a measured single hit.

## Pooling: the guarantee is at the spawn site

`utils/pool.ts` deliberately does not clear on release — it documents that a
recycled object keeps its old field values and callers must fully initialise it.
So every field a shot's behaviour depends on must be written on **every**
acquire, or a Long Baseline shot reusing a Transit's slot would silently pierce:
a weapon changing behaviour based on pool ordering, which is about as hard to
reproduce as a bug gets. A test pins it.

Noted while here: `deactivate` in `entities/Projectile.ts` is exported and
called by nothing. Left in place and documented rather than deleted, since it is
the obvious hook if the pool's policy ever changes.

## Test coverage

734 passing; 17 added — roster size and uniqueness, the class-wide Resonant
rule, the Recharge floor, the Phase 14 anchor pinned exactly, the charge-limited
budget cap, every `ShotProfile` kind having a live user, single stopping at the
first Contact, pierce passing through exactly its budget and no further, pierce
never double-hitting whether overlapping or not, pierce carrying full damage to
each target, burst splashing inside its radius and not outside, burst splashing
for less than a direct hit, burst not also piercing, and a recycled projectile
not inheriting the previous shot's shape.

## Carried forward

| Phase | Item |
|-------|------|
| 31 | Contact roster and per-Contact patterns; six exist, tiering still owed |
| 33 | `massed` and `pincer` waves, so Transit and Corona have content that rewards them |
| 33 | Stages 2–3 are unclearable with the opening formation; that is a ladder problem, not an Array problem |
| 35 | Full balance pass across prestige loops — the 1.15× budget cap is a guardrail, not a tuning |
| 37 | Burst and pierce want VFX that make the shape legible; both currently look like a single shot |
