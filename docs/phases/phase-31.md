# Phase 31: Contact Roster & Bullet Patterns

**Stage 4 — Content Production**
Output: `content/contacts.ts` (ten Contacts, three tiers), four new patterns,
`ContactTier`, the `wardsNearby` trait, the `guarded` wave shape,
`tests/contacts.test.ts`

## Checklist

- [x] Tiered roster (basic, elite, specialist)
- [x] Each with a unique pattern from `systems/patterns.ts`
- [x] Hooked into the spawn director
- [x] Clear attack telegraphs

> **Superseded terms.** PLAN.md calls these "enemies" and the file
> `content/enemies.ts`. Both were renamed in Phase 29.

## The roster

Ten Contacts. The six that existed keep their numbers, for the same reason Bolt
and Long Baseline kept theirs — they were tuned against measured clear rates
across Phases 15 to 20, and re-tuning them in the commit that adds four
unmeasured Contacts destroys the baseline the four are judged against.

| | Tier | Armour | Motion | Pattern |
|---|------|--------|--------|---------|
| Skiff | basic | massed | swarm | spread-3 |
| Mote | basic | erratic | swarm | spread-2 |
| Tender | basic | rigid | drift | ring-6 |
| Lance | elite | erratic | charge | aimed-1 |
| Harrier | elite | massed | charge | wall-5 |
| Hulk | elite | seized | drift | converge-7 |
| Shell | specialist | rigid | drift | wall-9 |
| Brood | specialist | massed | drift | ring-8 |
| Picket | specialist | erratic | orbit | spiral-4 |
| Warden | specialist | seized | drift | spiral-3 |

Every armour class appears in **more than one tier**, asserted by test. If one
lived in a single tier, that tier could be answered with one damage type and the
matrix would stop being a decision wherever the tier appeared alone.

## The tier is mechanical, not a label

`tier` changes what the wave director does: **the over-level bonus adds basic
Contacts only.**

Applied flat, a stage authored with two Shells runs five against a strong
formation. Three extra shielded Contacts is a *different puzzle*, not a harder
one — pressure on an over-levelled player should arrive as more bodies, never as
more set pieces. The stage's own `scaledCount` curve still applies to every
tier; it is only the over-level surcharge that is gated.

## `enemyPool` finally does something

It sat on `ZoneDef`, declared and read by nothing, for twenty phases. It is now
the zone's roster and three tests hang off it: every Contact a zone's waves
spawn must be listed, every listed id must exist, and **every authored Contact
must be reachable from some zone**. The last one is the important one — a
Contact no zone can spawn is content nobody will ever see, which is the same
dead-configuration problem as an unreachable branch.

## The trait that did not work, and what replaced it

The Warden was authored to **heal** nearby Contacts, at 5 HP/s within 90 px. It
is the roster's one Contact that punishes *ignoring* it rather than
mispositioning against it, and the only reason `highestThreat` targeting is
meaningfully different from `nearest`.

Measured across a full stage-3 clear, it healed **4 HP in total.**

Healing is structurally inert here. Contacts die in one or two hits, so almost
nothing survives damaged long enough to be repaired — the trait was decorative
and would have shipped that way, because every unit test of it passed.

Replaced with **damage reduction**: nearby Contacts take 65% damage. Reduction
applies to the *first* hit, so it cannot be skipped by killing quickly, and it
is felt whether a wave is being deleted or ground down.

Two details that matter:

- **Multiplicative stacking.** Additive reduction reaches 100% at three Wardens
  and makes a wave literally unkillable. Multiplicative approaches zero without
  arriving.
- **Cached per tick, not resolved per hit.** `updateWards` writes a
  `damageScale` onto each Contact once a tick. Damage is applied from four call
  sites and several times per Contact per tick; searching for Wardens at each
  would turn one O(n) pass into an O(n·hits) one for a number that cannot change
  in between. A test pins that the scale is cleared when the Warden dies —
  a cached multiplier is exactly the kind of thing that goes stale silently.

## The second measurement, and the wave shape it produced

With the aura working, it still covered only **1.5%** of Contact-ticks. The
mechanic was present and doing nothing, for a reason that had nothing to do with
the mechanic.

`escorted` puts the dangerous thing *behind* the bulk — right for a Lance, which
is a priority target walking into a busy line. For an aura it is wrong: the
Warden arrived six seconds later on its own bearing, by which time its Skiffs
had scattered and moved inward, and it spent the wave alone.

`guarded` is the counterpart: same delay, same arc, one tight bearing, so the
guard travels *with* what it protects. Coverage went to **5.1%** across the
whole stage — and the Warden exists only in the final wave, so within its own
wave it is far higher.

The rule, now written down in `waves.ts`: `escorted` for something that must be
**reached**, `guarded` for something that must be reached **first**.

## Patterns

Four added, bringing it to ten — one per Contact, asserted unique by test.
`spread-2` and `ring-6` are the sparse basics; `wall-5` is a short wall thrown
from close in, with a shorter telegraph than `wall-9` because a long warning
from that range would be a lie; `spiral-3` curves harder across fewer arms,
because a Warden is meant to be approached and killed rather than walled off.

Every telegraph is at or above the 400 ms floor, asserted by test.

## Motes cannot headline a wave, and the guard said so

The opening wave of stage 1 was rewritten to swap Skiffs for Motes one-for-one —
a Mote has 7 HP against 12, so the first thing a new player meets would get
gentler rather than busier.

The over-level guard rejected it. An all-Mote wave drops below the pressure
threshold, so the director starts adding bodies back; the bonus came out at
0.38 where every authored stage is required to read 0. Measured across counts
from 10 to 22, it never returns to zero — more Motes over the same window
*lowers* the wave's HP rate, so adding them makes the problem worse.

Motes now ride along with a Skiff backbone instead. Worth recording as a
property of the content rather than a bug: a Contact this frail can fill a wave
but cannot be one.

## Test coverage

757 passing; 23 added — the three tiers populated, ids and names unique, one
pattern per Contact and every pattern resolvable, telegraphs above the floor,
armour spread across tiers, tier HP ordering, the three `enemyPool` guards, the
over-level bonus scaling basics but not elites or specialists while the stage
curve still applies to all, the ward softening inside its radius and not
outside, never warding itself, stopping when dead, stacking without reaching
immunity, clearing a stale scale, being the roster's highest threat, being the
only warder, running in the real tick, and `guarded` sharing delay and arc where
`escorted` deliberately does not.

## Carried forward

| Phase | Item |
|-------|------|
| 32 | Bosses — the projectile budget headroom exists for exactly this |
| 33 | Five more zones; Harrier and Warden currently appear in one wave each |
| 33 | `massed` and `pincer` remain unused, and Transit and Corona still want them |
| 35 | Warden coverage is 5.1% of a stage; whether that is enough is a balance question, not a correctness one |
| 37 | Ten Contacts now need ten silhouettes; the supplied art has three |
