# Phase 16: Bullet-Hell Projectile & Pattern System

**Stage 2 — Core Combat Systems**
Output: `spiral` / `wall` / `converge` in `systems/patterns.ts`, pattern
reassignment in `content/enemies.ts`, `tests/patterns.test.ts`

## Checklist

- [x] Data-driven pattern definitions — all six from `combat-spec.md` §5
- [x] Consumed by `entities/Projectile.ts` via the spawn descriptor contract
- [x] Pooled via the Phase 11 object pool
- [x] Density and speed tuned as a deliberate choice, not a default

## The three that were missing

| Pattern | How it works |
|---------|-------------|
| **`spiral`** | Every projectile carries an `angularVelocity`, so one emission traces curved arms rather than needing a stream of emissions. `collision.ts` already rotated velocity vectors — this is the reason that support existed. |
| **`wall`** | A line across an arc with a contiguous gap whose position shifts between emissions, so one wall is not solvable forever. |
| **`converge`** | The only pattern that spawns **away from its emitter** — a wedge closing inward from the rim. |

### `converge` is a wedge, not a full circle

`combat-spec.md` described it as "from rim inward on all arcs". Built that way it
would spawn projectiles all around the field with no visible connection to the
Slack that fired them — unattributable, which is a legibility failure under P4
rather than drama.

It is now centred on the emitter's own bearing, so it still reads as *that*
Slack's doing while keeping the "closes from outside" character. A field-wide
version belongs to bosses, where the whole screen being the attack is legible
precisely because a boss is obviously the cause.

## Every pattern now has exactly one user

Cant and Fret were borrowing patterns that did not suit them. Reassigned so each
Slack's fire matches its behaviour:

| Slack | Pattern | Why it fits |
|-------|---------|-------------|
| Burr | `spread-3` | Baseline cone |
| Backlash | `aimed-1` | A charger commits to a line |
| Drift | `converge-7` | The anvil pulls a wedge in behind it; longest telegraph |
| Cant | `wall-9` | A shielded drifter laying a wall to plan around |
| Wear | `ring-8` | Divides on death, fires in all directions |
| Fret | `spiral-4` | **An orbiting emitter tracing curved arms is what a spiral is** |

Fret is the one that clicks: its motion archetype and its pattern are the same
idea expressed twice.

## Tone: readable pressure, not danmaku

PLAN.md asks for density and speed to be a deliberate choice. The choice, and
the reasoning:

The player's only live input is a **coarse area strike**. There is no precise
dodge to reward, so dense fast curtains would punish without offering
counterplay — and P4 makes legibility non-negotiable.

- Speeds **85–155 px/s**, roughly half genre-typical; rim to centre in 2–4 s.
- Counts **in single digits** per emission; pressure comes from several Slack on
  staggered cadences.
- Telegraphs **450–750 ms**, scaling with how much ground a pattern denies.

Asserted by test rather than left as intent — speed bounds, emission counts and
the telegraph floor all fail loudly if a later tuning pass drifts.

### Measured density

| Stage | Peak concurrent | % of budget |
|-------|-----------------|-------------|
| First Shift | 12 | 2% |
| Routine Maintenance | 18 | 3% |
| Noted in the Log | 30 | 5% |

**This may be too sparse.** 30 projectiles at peak does not read as bullet-hell
by any normal standard. The headroom is deliberate — it belongs to Phase 32
bosses — but whether the base game currently feels like *pressure* or like
*nothing much* is a playtest question, flagged for Phase 19/20 where the scaling
director will drive it up.

## A real bug the tests caught

`spread(1, ...)` fired at the **arc's left edge**, not at the target.

The implementation guarded the division by zero (`step = 0` when `count === 1`)
but still started at `centre - arc / 2`, so a lone shot went half an arc wide.
The comment directly above it claimed the opposite — it was aspirational rather
than descriptive.

No content used `count: 1`, so it had never shown up in play. It would have
surfaced as a mysteriously inaccurate single-shot enemy somewhere in Phase 31.

## Angle assertions need care

Four test failures were mine, not the code's: raw `atan2` values cannot be
compared directly. A shot aimed left is `-π` or `+π` depending on the sign of a
near-zero `y`, and a spread straddling `π` wraps so `max - min` reports nearly
`2π`. Every angular assertion now goes through a shortest-delta helper.

Worth remembering — the same trap will appear in Phase 17's collision work and
Phase 32's boss patterns.

## Test coverage

274 tests passing; 26 added, covering each pattern's defining property, purity
(same input → same output, no context mutation, no shared position objects), the
telegraph floor, the tone bounds, and content wiring in both directions — every
Slack has a pattern that exists, and every pattern has a user.

## Carried forward

| Phase | Item |
|-------|------|
| 19 | The scaling director drives density; current peak is 5% of budget |
| 20 | Is the base game too sparse to read as bullet-hell? Needs eyes |
| 31 | Full roster; patterns may want per-Slack parameter overrides rather than fixed ids |
| 32 | Multi-phase boss patterns, and where a genuinely field-wide `converge` belongs |
