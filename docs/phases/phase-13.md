# Phase 13: Ally Auto-Battle AI

**Stage 2 — Core Combat Systems**
Output: `systems/ai.ts` (completed against the spec), `tests/ai.test.ts`

## Checklist

- [x] Targeting logic — `nearest`, `lowestHp`, `highestThreat`, `deepest`, `none`
- [x] Attack timing / cooldown per ally
- [x] Formation grid with positional bonuses (built in Phase 10, now tested)
- [x] Audited against `combat-spec.md` §2 rather than assumed complete

## Scope note

A working version of `ai.ts` landed in Phase 10 as part of the vertical slice.
This phase audited it against the spec instead of treating it as done, which
turned up one correctness gap, one performance problem, and a large hole in test
coverage — targeting had **no** dedicated tests, despite being the system that
decides what the whole auto-battle does.

## The correctness gap: reach was unbounded inward

`withinReach` checked only an *outer* bound. A Pallet on ring 3 could strike a
Slack sitting at radius 10 — essentially on the Mainspring.

That quietly undermined the central idea. If every unit can hit anything that
has got past it, ring assignment stops mattering and layered defence is
decorative. Pillar P2 says position is a real decision; it was not one.

The band is now bounded both ways:

```
innerBound = isInnermostRing ? 0 : radius_r - 40
outerBound = radius_(r + radialReach) + 40
```

**The innermost ring is exempt**, deliberately. It is the last line, and without
that exemption a Slack that reached the Mainspring would be unreachable by
anything at all — a strictly worse bug than the one being fixed.

Depth of penetration now costs the defender something, which is what makes the
rings a defence in depth rather than three arbitrary shelves.

### Gameplay impact, measured

| | Before | After |
|---|---|---|
| Stage 1 clear time | 37.05 s | **37.75 s** |
| Lowest Tension | 96.7% | **94.8%** |

Slightly harder, in the intended direction, with no change to the outcome.

## The performance problem

`updateMovements` did two wasteful things per tick:

1. `living.filter(...)` — **one array allocation per Movement per tick**. At a
   full formation that is 30 allocations a tick, 600 a second.
2. `movementPosition()` was called inside the per-Slack reach check, so its
   trigonometry ran once per **(Movement × Slack) pair** — 6000 times a tick at
   full budget.

Both are gone. Reach parameters are computed once per unit into a `Reach`
struct, and target selection is a single allocation-free pass that finds the
best candidate and notices whether the existing target is still valid at the
same time.

Measured at 6 Movements × 200 Slack (1200 pairs): **0.1 ms median, 0.2 ms p95.**
This was never the bottleneck — Phase 11 established that rendering is — but it
scaled with content in a way that would have become one.

## Also cleaned up

**`nearest` was a special case.** It scored 0 in `selectTarget` and was handled
by a separate `nearestTo` function alongside it. Every policy now scores through
one `score()` function, so selection is one code path. `nearest` uses squared
distance — no square root is needed to rank.

**`threatWeight` was undocumented.** The implementation multiplies the spec's
threat formula by a per-Slack weight from `content/enemies.ts`. That is a useful
extension — it lets content mark a type as disproportionately urgent without
touching the formula — but it was not in `combat-spec.md`. Now it is.

## Test coverage

223 tests passing; 28 added this phase, and they are the first tests of
targeting at all.

| Group | Covers |
|-------|--------|
| `angleDelta` | Shortest signed angle, wrapping across the 0/2π seam |
| `threat` | Rises toward the centre; accounts for danger, not just position |
| Targeting policies | Each of the five picks what it claims to |
| Annular reach | Angular arc, outward bound, **inward bound**, innermost exemption |
| Attack timing | Cooldown gating, haste, disabled units recovering at full HP |
| Re-targeting | Holds a valid target, switches when it leaves reach, drops to null |
| Chimes | Whole-field reach, charge spending and regeneration, **target leading** |
| Rotation | A fixed arrangement acquires a target as the ring turns it into range |

That last one is worth naming: it asserts pillar P2 directly. The same formation
covers different arcs at different moments, and the test watches a unit acquire
a target purely because the ring carried it there.

## Carried forward

| Phase | Item |
|-------|------|
| 14 | Chime AI diverges further; may warrant splitting into `supportAi.ts` |
| 17 | Spatial partitioning would cut the (Movement × Slack) scan, though it is not currently hot |
| 20 | `RADIAL_MARGIN` (40 px) is untuned; it decides how forgiving the band edges feel |
| 29 | Roster content will exercise policies that currently have one user each |
