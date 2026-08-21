# Phase 12: Defended-Objective Base Entity

**Stage 2 — Core Combat Systems**
Output: `entities/Mainspring.ts` (expanded), `systems/objectiveRules.ts` (new),
`tests/objectiveRules.test.ts`

## Checklist

- [x] The central object, named per the Phase 1 theme — **the Mainspring**
      (PLAN.md calls this `Objective.ts`; see the vocabulary map in `CLAUDE.md`)
- [x] Loss condition (objective overwhelmed) in a dedicated `objectiveRules.ts`
- [x] Stage-clear condition in the same module
- [x] Regeneration hooks
- [x] Shielding hooks

## Why a separate rules module

`Mainspring.ts` holds what is intrinsic to the object: what damage does, what a
repair costs, whether it is overwhelmed. `objectiveRules.ts` holds what depends
on the whole simulation: whether the wave is done, whether the stage is cleared,
how waves advance.

Win and loss conditions are the rules players argue about most. They should be
readable and testable **without reading a tick function** — which is what they
required before this phase, since they lived inline in `loop.ts`.

## Decisions locked

### Regeneration is paused during a live wave

It ticks only in `wave-gap`.

`game-loop.md` says damage carries into the next wave as reduced Tension.
Continuous regeneration would erode that — sustained pressure could be
*out-healed* rather than survived. Confining recovery to the gap keeps the
carry-over meaningful and turns the gap into a real beat instead of dead time.

Controlled by `REGEN_IN_COMBAT`, so the decision is one constant to revisit in
Phase 20 rather than logic to untangle.

### Shields replace, they do not stack

A stronger grant overwrites a weaker one; a weaker grant only extends the
existing duration. Stacking would let a player bank conjunctions into an
invulnerability window, fighting the no-wall principle in `economy-spec.md` §5.

### Loss is checked before clear

A Mainspring reaching zero on the same tick the last Slack dies is a **loss**.
Clearing a stage you did not survive would be incoherent, and this is exactly
the kind of edge that silently picks a side if left unstated. Tested explicitly.

### Tension thresholds fire downward only

50% / 25% / 10%. Regenerating back up through one is not an event, or a
Mainspring hovering at a threshold would spam them. These drive HUD warnings,
achievements ("Within Tolerance"), and later boss phase triggers.

## A real bug the tests caught

Thresholds were originally detected inside `updateObjective`, which runs at
**step 2** of the tick. Damage lands at **steps 6–8**.

So the check compared the post-damage value to itself and **could never fire**.
Every threshold test failed on the first run.

The fix splits it: `updateObjective` handles recovery at step 2, and a separate
`checkThresholds` runs at step 10, after damage, comparing against a
`previousFraction` baseline stored on the Mainspring. `lowestFraction` moved into
`damageMainspring`, which is the only path by which Tension falls.

Worth noting as a pattern: **anything that observes change must run after the
step that causes it**, and the numbered order in `combat-spec.md` §8 is the thing
to check against.

*(An earlier draft of this note claimed conjunctions had the same problem. They
do not — rings advance at step 1 and conjunction evaluates at step 9, which is
correct. The claim was checked and withdrawn.)*

## Two further bugs found while checking that claim

### Chime shots and conjunction pulses bypassed the type matrix

`resolveChimeProjectile` and the conjunction `damagePulse` both applied **raw
damage** — no type multiplier, no armour mitigation — while Movement melee and
the Beat went through `computeDamage`.

That made "Chimes are always Resonant" (`combat-spec.md` §4) meaningless: the
entire reason they counter `Erratic` and struggle against `Seized` is the
×1.5 / ×0.75, and none of it was applied. They also ignored armour completely.

Conjunction pulses now carry the participating Movement's damage type, so an
off-type build is no longer strictly better at conjunctions than an on-type one.

Balance impact at stage 1 is small — clear time moved 35.5 s → 37.05 s — because
early Slack have low defence and a narrow type spread. It will matter much more
once Phase 31 fills out the tiered roster.

### `Math.random()` in the simulation

`spawn.ts` used `Math.random()` for pattern-cooldown stagger, directly
contradicting the invariant `rng.ts` documents and Phase 10 claimed.

The Phase 10 determinism test missed it because it compared kill counts and
Filings, which survive small timing jitter. Tension does not: three identical
runs gave lowest-Tension fractions of 0.972 / 0.976 / 0.972.

`createSlack` now takes an **optional** `rng`. Omitting it yields a fixed
stagger, so a caller can never introduce nondeterminism by forgetting to thread
a generator through — the unsafe behaviour has to be opted into. The determinism
test now compares Tension and a full per-entity snapshot; four consecutive runs
are bit-identical.

## Verified in the browser

Two full runs through the real loop:

| Run | Result | Thresholds fired |
|-----|--------|------------------|
| Defended (6 Movements, 2 Chimes) | **Cleared**, lowest Tension 97.2% | none — never dropped below 50% |
| Undefended (all units removed) | **Lost**, phase `overwhelmed` | `[0.5, 0.25, 0.1]` — each exactly once, in order |

## Hooks left for later phases

| Hook | Consumer |
|------|----------|
| `Simulation.repairMainspring()` → `{ repaired, cost }` | Phase 21 owns the Filings transaction |
| `Simulation.shieldMainspring(amount, duration)` | Conjunctions (Phase 18), upgrades (Phase 22) |
| `mainspring.regenPerSecond` | Bracing branch, Phase 22 |
| `TickEvents.thresholdsCrossed` | HUD warnings (Phase 42), achievements (Phase 28), boss phases (Phase 32) |
| `clearedUntouched(sim)` | "Within Tolerance" achievement; also a Phase 20 telemetry signal — a stage routinely cleared untouched is under-tuned |

`repairMainspring` returns the cost rather than charging, so Phase 21 owns the
economy and this phase owns only the effect.

## Test coverage

190 tests passing; 32 added this phase covering the Mainspring, shields,
regeneration, thresholds, repair, stage progression and tick integration.

Two guards worth naming: **a simultaneous zero-Tension and final kill is a
loss**, and **threshold events do not accumulate across ticks** (a shared array
would have leaked them).
