# Phase 11: Performance & Low-Spec Budget Plan

**Stage 1 — Technical Foundation**
Output: `content/budgets.ts`, budget instrumentation in `core/loop.ts`,
diagnostics overlay, `tests/budgets.test.ts`, and the "Performance budgets"
section of `docs/architecture.md`

## Checklist

- [x] Entity-count and particle budgets set for a browser target, documented in
      `docs/architecture.md`
- [x] Object pooling for short-lived entities — `utils/pool.ts`, used by the
      projectile system
- [x] Lightweight profiling habit: in-app fps / entity-count overlay, toggled in
      dev builds and persisted
- [x] Budgets derived from measurement rather than estimate

## Where the time goes

The headline finding, and the one that shaped everything else:

**Simulation cost is unmeasurable.** It does not reach 0.1 ms even at 2500
entities with a saturated projectile pool. Rendering is effectively 100% of the
frame cost.

| Slack | Bullets | Sim | Render | Combined | % of frame |
|---|---|---|---|---|---|
| 300 | 594 | 0.0 ms | 2.9 ms | 2.9 ms | 17% |
| 600 | 593 | 0.0 ms | 4.6 ms | 4.6 ms | 28% |
| 1000 | 573 | 0.0 ms | 6.8 ms | 6.8 ms | 41% |
| 1500 | 564 | 0.0 ms | 9.9 ms | 9.9 ms | 59% |
| 2500 | 524 | 0.0 ms | 17.0 ms | 17.0 ms | **breaks** |

## The optimisation this found

Isolating per-entity cost from the deltas gave **~12 µs per Slack per frame**
against **~4 µs per projectile**. Slack were three times more expensive than
bullets, which made no sense — they are simpler shapes and there are fewer of
them.

The cause: `drawSlack` called `clear()` and rebuilt geometry **every frame**, for
entities that mostly were not changing. An undamaged, non-telegraphing Slack
looks identical frame to frame and only needs its position updated.

`render.ts` now keeps a signature per Slack — hit-flash, shield, and health
quantised to 20 steps — and rebuilds geometry only when it changes. Telegraphing
Slack are exempt because they animate, but only a handful telegraph at once.

**Result: 2.1× across the board.**

| Slack | Before | After |
|---|---|---|
| 300 | 5.6 ms | **2.9 ms** |
| 600 | 9.0 ms | **4.6 ms** |
| 1000 | 14.3 ms | **6.8 ms** |
| 1500 | 20.6 ms ✗ | **9.9 ms** ✓ |

Per-Slack cost fell to ~5.8 µs; the ceiling moved from ~1200 to ~2200 concurrent
Slack.

### Verified lossless

A skipped redraw is exactly the bug this kind of optimisation introduces, so it
was checked at pixel level with `gl.readPixels`:

| Case | Pixels changed | Expected |
|------|----------------|----------|
| Idle frame re-rendered | **0** | Nothing — the skip must be invisible |
| Slack damaged | 110 | Health arc appears |
| Hit flash | 396 | Body colour changes |
| Telegraph starts | 388 | Warning ring appears |

Zero drift when idle, correct redraw on every state that matters.

## The budgets

In `src/lib/content/budgets.ts`, mirrored in the `budget` rows of
`balancing.csv`.

| Budget | Value | Kind |
|--------|-------|------|
| Concurrent Slack | **200** | Content constraint |
| Live projectiles | **600** | Runtime cap |
| Particles (Phase 40) | **400** | Content constraint |
| Units | **38** | Structural — total slots + rim mounts |
| Frame safety factor | **0.6** | 10 ms of the 16.67 ms frame |

### Content constraints, not runtime clamps

The distinction is deliberate and load-bearing. Silently truncating a wave would
change authored difficulty **invisibly** — a designer would tune against
behaviour the engine was quietly rewriting. A brief frame dip is the lesser
failure, and it is at least visible.

So `tests/budgets.test.ts` walks every authored stage and asserts worst-case
concurrent spawns stay inside budget, and `Simulation` *counts* ticks spent over
budget without ever dropping an entity. Tested explicitly: after flooding past
the budget, `state.slack.length` is unchanged and `ticksOverSlackBudget` is
non-zero.

**The projectile budget is the one genuine runtime cap.** Patterns emit far more
than content can predict, and refusing a bullet degrades gracefully where
refusing a spawn would rewrite the encounter.

## Deviation from PLAN.md: enemies are not pooled

PLAN.md asks for pooling of "projectiles/enemies/support units". Projectiles are
pooled. **Enemies and support units are deliberately not**, and the measurement
above is why: simulation cost is unmeasurable, so pooling them would optimise
something that costs nothing.

It would also cost something real. `SlackInstance.def` and `.id` are `readonly`
by the Def/Instance convention set in Phase 8; pooling requires reassigning both.
Trading a documented invariant for an unmeasurable gain is a bad trade.

Revisit only if profiling shows allocation pressure. It does not today.

## Low-spec margin

At the 200-Slack budget the reference machine spends roughly **2.4 ms** of its
16.67 ms frame — about **7× headroom**. A machine up to ~7× slower than an RTX
3060 still holds 60 fps at full budget, which integrated graphics typically sit
inside.

**This is an extrapolation, not a measurement**, and it is the weakest claim in
this phase. Phase 46 owns the real low-spec pass. A 30 fps floor on the weakest
targets is acceptable; 60 fps on mid-range is not negotiable.

## Profiling

`F2` toggles the diagnostics overlay: fps, the frame/sim/render split, live and
peak counts against budget, refused spawns, and ticks over budget. It persists
via `settings.showFps`, so a profiling session survives a reload.

Three counters turn red, each meaning something specific:

- **refused** — the projectile pool hit its cap; bullets were dropped.
- **over budget** — ticks above the Slack budget; a content bug.
- **render** — the frame exceeded the safety factor.

## Test coverage

158 tests passing; 8 added this phase (`tests/budgets.test.ts`), covering budget
definitions, content conformance, and that instrumentation reports without
clamping.

## Carried forward

| Phase | Item |
|-------|------|
| 33 | Authored content is far below the Slack budget; the guard is in place before it fills up |
| 40 | The 400-particle budget is reserved and unspent |
| 46 | Re-measure on real low-spec hardware; the 7× margin is extrapolated. Also revisit Pixi's seven code-split chunks |
| 20 | Diagnostics overlay is the tool for the balancing pass |
