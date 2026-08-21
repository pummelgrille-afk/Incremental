# Phase 10: Core Loop Prototype

**Stage 1 — Technical Foundation**
Output: `core/{loop,bootstrap,formation,rng,render}.ts`,
`systems/{ai,spawn,combat,collision,patterns,synergy}.ts`,
`stores/game.svelte.ts`, `ui/HUD.svelte`, `utils/pool.ts`

## Checklist

- [x] Bare-bones vertical slice wired end-to-end through `core/`, `systems/`,
      `entities/` and a minimal `HUD.svelte`
- [x] Ally, enemy type, projectile pattern, resource drop — all present
- [x] Placeholder art in our own theme (brass primitives, no external assets)
- [x] Lives behind the app's default component, so `npm run dev` shows it
- [x] Frame pacing validated in-browser
- [x] Answered: does the auto-battle + bullet-hell mashup work at 60 fps?

## Scope note

PLAN.md asks for "one Ally, one Enemy type". This slice has **3 Movements, 1
Chime and 3 Slack**, deliberately: conjunction needs two Movements on
*different* rings to occur at all, and the type matrix needs two damage types to
mean anything. Answering combat-spec.md §9 was the point of the phase, and the
literal minimum could not have answered it.

## The loop runs

A complete stage, simulated headlessly in Chrome:

| | |
|---|---|
| Outcome | **Stage cleared** at tick 698 (34.9 s) |
| Slack killed | 24 |
| Filings earned | 141 |
| Mainspring hits | 3 |
| Conjunctions | 26 |
| Tension remaining | 976 / 1000 |
| Simulation cost | **0.0195 ms/tick** |

Spawn → auto-battle → drops → wave progression → clear all work end to end.

## Frame pacing — validated

Sim tick plus a full render, measured in Chrome on an NVIDIA RTX 3060, 150
samples per tier:

| Slack held | Live projectiles | Sim median | Render median | Combined | % of 60 fps frame |
|---|---|---|---|---|---|
| 50 | 133 | 0.1 ms | 0.9 ms | 1.0 ms | **6.0%** |
| 150 | 576 | 0.0 ms | 2.0 ms | 2.0 ms | **12.0%** |
| 300 | 598 (capped) | 0.0 ms | 2.9 ms | 2.9 ms | **17.4%** |

**The simulation is effectively free.** Even at 300 enemies and a saturated
projectile pool it does not reach 0.1 ms — 0.2% of the 50 ms tick budget.
Rendering dominates by roughly 30×, which retroactively confirms ADR-001 was
the decision that mattered.

At 300 Slack the pool hit its 600 cap and refused 143 acquisitions. It degraded
exactly as designed: fewer bullets, no allocation, no stutter, and
`pool.exhausted` recorded the overrun for Phase 11 to read.

**Answer to PLAN.md's question:** yes, comfortably. 60 fps is not in question;
the budget has roughly 5× headroom before it is.

*(These figures predate the nudge→Beat change. That change removed per-ring
nudge bookkeeping and added one instant area query per click, so the cost is
strictly lower. Not re-measured, because nothing in it could raise the number.)*

## combat-spec.md §9 — answers

### Q1 — Is a 6° conjunction tolerance perceptible, or does it fire faster than it reads?

**The tolerance is not the limiting factor; the 6 s cooldown is.** Over 5
simulated minutes with 6 Movements, alignments occurred constantly — rings sweep
past each other often enough that 6° is reached almost continuously. What
actually gates firing is the per-slot-set cooldown.

Implication for Phase 20: tuning `conjunction.tolerance` will barely move the
feel. Tune `conjunction.cooldown` instead. Recorded in `balancing.csv` terms —
the tolerance row is close to inert, the cooldown row is the live one.

### Q2 — Is a 2.5 s nudge cooldown per ring engaging or fidgety?

**Fidgety — and the mechanic was removed because of it.**

The mechanism was verified exact: the impulse applied 0.6283 rad on ring 2,
precisely 2π/10, one slot-width; a second nudge was refused while cooling and
accepted after; the three rings were independent. It did what the spec said.

The spec was wrong. Played by a human, tracking three independent cooldowns and
reacting to incoming patterns under time pressure is **a dexterity test**, which
pillar P3 explicitly forbids. The implementation contradicted the pillar and the
pillar won.

Player report: *"the selection thing feels kinda awkward — I have to think fast
and much about what ring to rotate and when, to not get hit."*

Two distinct faults, worth separating because only the first is obvious:

1. **Cognitive load.** Three objects × two directions × timing, all live.
2. **It was defensive.** Its purpose was to *avoid damage*, so a mistake was
   punished with a hit. An input whose failure mode is loss generates pressure
   that no amount of cooldown tuning removes. This is the deeper fault, and it
   would have survived any rebalancing of the first.

### The replacement: the Beat

Rings are now **permanently constant and never controllable** — not by input,
not by upgrade. The live input is the Beat: click a point, strike it instantly
in a 44 px radius, 3 charges regenerating one per 3 s.

| | Nudge (removed) | Beat |
|---|---|---|
| Purpose | Avoid damage | Deal damage |
| Failure mode | **You take a hit** | You dealt less damage |
| Objects to track | 3 rings × 2 directions | 1 |
| Aiming skill | Timing against moving patterns | None — instant, area |
| Ignoring it | Loses stages | Still clears stages |

That last row is the test that matters, and it is enforced by
`tests/simulation.test.ts`: a stage clears with `beat.struck === 0`. P1 says the
machine runs without you; now it demonstrably does.

Full write-up in `combat-spec.md` §1. `pillars.md`, `game-loop.md`,
`market-research.md`, `economy-spec.md` and `balancing.csv` were updated in the
same change, so no doc still describes the nudge as live.

### Q3 — Do rotating defenders read clearly at 200+ projectiles?

**Yes — confirmed by playtest.** Could not be answered from the harness (the
preview pane does not composite frames, so requestAnimationFrame never runs), so
it was settled by playing the build. No legibility problem observed.

This was the main open risk against pillar P4, and it is now closed. The brass
palette on a dark field plus the ring tracks give enough of a fixed reference
that rotation does not muddy the read. Phase 39 and 40 must not spend that
margin carelessly — backgrounds stay low-contrast and particle counts stay
inside the Phase 11 budget.

### Q4 — Does the block-arc mechanic communicate itself without a tutorial?

**Not answerable here** — same reason. The mechanic works (`movementHits` is
tracked and Movements take the damage they intercept), but whether a player
*infers* it needs a playtest. Carried to Phase 36.

### Q5 — Are three rings the right number?

**Provisionally yes**, and the case is now cleaner than it was.

Originally three rings were justified partly by giving the nudge three
independent cooldowns. With the nudge gone, that argument disappears — and the
answer does not change, which is a better sign than if it had.

What remains: three rings give conjunction three distinct scales
(minor/major/grand). Two would make `grand` unreachable and collapse the
symmetric-versus-asymmetric trade below into something trivial. Four would add
combinatorial depth the player has no interface to reason about yet. Revisit at
Phase 20, once the formation editor exists.

## Two design findings

### Symmetric formations waste conjunctions

Comparing two 6-unit formations over 5 simulated minutes each:

| Formation | Firing moments | Total conjunctions | Moments with overlap |
|---|---|---|---|
| Mirror-symmetric | 10 | 20 | **10 — every one** |
| Asymmetric | 17 | 17 | **0** |

A mirror-symmetric formation fires its conjunctions *simultaneously* — the
mirrored pair aligns at the same instant — so 20 conjunctions arrive in only 10
bursts. An asymmetric formation produces slightly fewer but spaces every one of
them out.

That is a real strategic trade the player can reason about — burst versus
sustain — and **it was not designed in**. It falls out of the rotating-ring
model. Worth protecting in Phase 24's editor and worth teaching in Phase 36.

### Ring periods being coprime is load-bearing

8 : 14 : 22 reduces to 4 : 7 : 11, pairwise coprime, and that is why alignments
never settle into a short repeating cycle. It is currently a comment in
`content/field.ts`. It should be a **constraint** — any Phase 20 retune of ring
periods that picks non-coprime values will silently collapse conjunction into a
metronome.

## Placeholder scope, flagged in-file

| Module | Deferred to |
|---|---|
| `systems/patterns.ts` | Phase 16 — 3 of 6 patterns; no spiral/wall/converge |
| `systems/spawn.ts` | Phase 15 — `orbit` motion falls through to `drift` |
| `systems/collision.ts` | Phase 17 — linear scan, no spatial partitioning |
| `core/formation.ts` | Phase 24 — no editor, no persisted loadouts |
| `core/render.ts` | Phases 37–40 — Graphics primitives, no sprites or VFX |
| `content/allies.ts`, `supportUnits.ts` | Phases 29–30 |

Linear collision was a deliberate call: at these entity counts it measures fine,
and a spatial grid built before the access patterns are known would be guesswork.

## Test coverage

138 tests passing; 47 added this phase.

| File | Covers |
|------|--------|
| `tests/simulation.test.ts` | Fixed timestep, catch-up clamp, determinism, ring rotation, Beat mechanics, damage formulas, formation bonuses, conjunction rules, stage progression, telegraphs, budget degradation |
| `tests/pool.test.ts` | Preallocation, exhaustion, reuse, churn, double-release safety |

Two guards worth naming: the simulation is **deterministic for a given seed**
(two instances run 400 ticks and agree exactly), and a projectile **never spawns
without a telegraph first**.

## Carried forward

| Phase | Item |
|-------|------|
| 11 | Pool instrumentation exists (`peak`, `exhausted`); needs budgets + a low-spec re-measure |
| 15–17 | Full motion set, pattern set, spatial partitioning |
| 20 | Q5; tune conjunction **cooldown** not tolerance; keep ring periods coprime; tune Beat damage so ignoring it stays viable |
| 24 | Formation editor should surface the symmetry trade-off |
| 36 | Q4 — whether block-arc teaches itself |
