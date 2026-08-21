# Phase 32: Boss Encounters

**Stage 4 — Content Production**
Output: `entities/Boss.ts`, `content/bosses.ts`, `systems/boss.ts`, boss
bounties in `progression/currencies.ts`, `tests/bosses.test.ts`

## Checklist

- [x] 3–5 milestone bosses
- [x] Multi-phase attack patterns
- [x] Unique rewards
- [x] Playtest spike-vs-flow difficulty balance

## A boss is a Contact

The single design decision this phase rests on. A boss is spawned as an ordinary
`ContactInstance` from a def synthesized at runtime, so it inherits motion,
hurtboxes, the damage formula, armour matchups, telegraphs and pattern emission
without a second implementation of any of them.

A parallel boss pipeline would be four systems running alongside the ordinary
ones, and the first to drift would be the damage formula — bosses would quietly
stop respecting armour matchups, and the type matrix would mean nothing in
exactly the fights where build choice matters most.

What a boss adds is **phases**, and nothing else is special-cased.

## What a phase may change

A phase changes what the boss fires and how often. It does **not** change
armour, speed or hurtbox.

That restraint is deliberate. A phase that swapped armour class would mean a
player's counter-pick stops working halfway through a fight they already
committed a formation to — and formations cannot be changed mid-stage
(game-loop.md). A boss may get harder to dodge; it may not retroactively
invalidate the build brought to it.

Phase changes are telegraphed like any other attack, and the boss **holds fire**
for the whole transition. That window is the point: a step change nobody sees is
not a phase, it is a stat edit.

Three details found while wiring it:

- **The telegraph has to start on the detection tick**, not the one after. The
  first version set it only inside the countdown branch, leaving a one-tick
  window in which the boss had already changed phase and could still emit.
- **Transitions only ever go forward.** The Dark Watch summons a Warden, and a
  boss pushed back above a threshold would oscillate between two phases and
  never resolve.
- **The cooldown re-arms on the new interval.** Inheriting the old phase's
  countdown makes a slow phase followed by a fast one fire the instant the
  transition ends.

## Rewards

Boss stages already paid 5 Clearance (economy-spec.md §1). The unique part is a
one-off **Salvage bounty**, authored per boss from 400 to 1200.

Salvage rather than Clearance because the two answer different questions:
Clearance measures content *seen*, and paying bosses in it would make roster
breadth depend on *beating* bosses rather than on reaching them — a harder gate
than the unlock curve is authored for. A bounty is won in a run, so it lands in
`run.salvage` and a Rewind takes it with everything else.

## The measurement, and the error it caught

PLAN.md asks for a spike-vs-flow playtest. The first run of it was unambiguous:
a normal stage at depth 8 cleared **6/6 at 1.00 Output**, and every boss lost
**0/6**. Not a spike — a wall.

The cause was mine. `maxHp` on a `BossDef` is documented as *before* the stage
curve and the ×12 boss multiplier, exactly like every other `maxHp` in
`content/`. I authored 260–700 as though they were final numbers. At stage 8
that put The Backlog at **8,900 HP** against a measured player output of ~107
HP/s — an 83-second fight against a Sun that dies in about 45 — and The Dark
Watch at 23,962.

Re-derived from target fight length instead: base 90 to 185.

| At its own depth | Boss | Normal stage |
|---|---|---|
| stage 8 — The Backlog | 6/6, 0.82 Output, 29 s | 6/6, 1.00 Output |

That is the shape a milestone should have: clearable, and it costs something. It
is also a real gate — the same boss loses 0/6 against a formation one third
sparser, which is the check a milestone exists to be.

**What I could not measure, stated plainly.** Bosses 2 to 5 all fail at their
intended depths — and so does the *normal* stage at 32 and 40, in the same
model. The probe holds one formation fixed while the HP curve climbs, and a real
player at stage 40 has levelled units, tree nodes and more slots. So the result
says nothing about those four bosses; it says my model of the player stops being
valid past about stage 16. Modelling growth across prestige loops is Phase 35's
job and this phase does not pre-empt it.

A test now pins the order of magnitude for the one boss whose depth is known,
anchored to the toughest ordinary Contact rather than to a bare constant, so a
roster rebalance carries it along.

## Reachability, stated plainly

**No authored stage reaches a boss.** They fall every 8 stages and zone 1 stops
at scaling index 3. Phase 33 builds the ladder that reaches stage 8.

Rather than leave the system untested until then, `tests/bosses.test.ts` runs a
real boss stage end to end — built through the real loader, run on the real loop
— and `stageLoader` now validates `bossId` against `content/bosses.ts`, which it
could not do before this phase existed. A typo in a Phase 33 zone will fail
loudly rather than produce a boss stage with no boss in it.

That validation immediately caught a placeholder: a scaling test asserted a
boss-interval stage passed validation using `bossId: 'whatever'`.

## One stale-state bug, of a familiar kind

`Simulation.tick` returns early once a stage resolves, so `updateBoss` never runs
again to clear its own runtime — the encounter state sat pointing at an entity
that no longer existed for as long as the state was kept. Cleared where the
stage resolves instead. Same class as the cached `damageScale` in Phase 31, and
found the same way: by asserting the cleanup rather than assuming it.

`bossSpawnedFor` exists for the mirror-image reason. Keying "already spawned" on
`sim.boss` being null cannot work, because a defeated boss clears its own
runtime — the encounter would respawn on the next tick and the wave could never
complete.

## Test coverage

788 passing; 31 added — the five names transcribed from narrative.md in order,
count and uniqueness, every boss multi-phase, phases opening at full health and
ordered downward, every phase pattern resolvable, summons resolvable and never
in an opening phase, transitions telegraphed above the floor, unique ascending
bounties, the HP scale guard, `phaseAt` at and between thresholds, spawning as
an ordinary Contact, the multipliers applied exactly once, the telegraph holding
fire, the pattern and interval swapping, the cooldown re-arming, never walking
backwards, identity and damage surviving a swap, summons arriving near the boss
and only in the phases that call for them, the runtime clearing on death, and a
full boss stage spawning once, running every phase, and resolving.

## Carried forward

| Phase | Item |
|-------|------|
| 33 | Place the five bosses; the ladder must reach stage 8 for the first |
| 33 | narrative.md assigns bosses to zones 2–6; the interval decides the stage, so the two have to be reconciled when the ladder is authored |
| 34 | The Almanac reveals on a first boss clear (`isTreeRevealed`), already wired and unreachable until a boss stage exists |
| 35 | Bosses 2–5 are unmeasured; the player model breaks down past ~stage 16 |
| 36 | A boss health bar and a phase-change banner; `BossRuntime.announced` is populated for exactly this and nothing reads it yet |
| 37 | Five bosses need silhouettes distinct from the ten Contacts |
