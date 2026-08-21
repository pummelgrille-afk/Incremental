# Phase 27: Idle/Offline Progress Calculation

**Stage 3 — Progression Systems**
Output: `systems/offlineProgress.ts`, `ui/WelcomeBack.svelte`, save schema 4 and
its migration, two Salvage nodes, `tests/offlineProgress.test.ts`

## Checklist

- [x] Time-elapsed-since-last-session, from the Phase 9 timestamp
- [x] Capped and diminishing rewards
- [x] "Welcome back" summary component

## Three gaps, not one

economy-spec.md §4's formula is short, and the interesting part is that **three
separate mechanisms** keep offline play below active play rather than one:

1. **Efficiency is a fraction**, clamped below 1 forever.
2. **The diminishing curve** halves the marginal rate every four hours.
3. **Only Filings accrue.** No conjunctions fire, no stage progress happens, and
   therefore **no Keys can ever be earned offline**.

The third is the load-bearing one and it is a design decision rather than an
omission. Filings buy the *size* of a formation; Keys buy the roster itself. A
player who leaves the game running cannot unlock a single unit. That is P1
honoured precisely — the machine runs without you, but not as well — and the
module's header says so, so nobody later "fixes" it.

A test drives every combination of maximum investment and absence length up to
200 hours and asserts the payout never reaches the active equivalent.

## The cap is a curve, not a cliff

Time past the cap earns nothing, but the diminishing curve means the approach to
that boundary is already gentle — the fourth hour is worth half the first. A
hard cap with a flat rate up to it would make the player feel robbed at the
exact moment they crossed; a curve makes the boundary uninteresting.

Both are reported. `wastedSeconds` exists precisely so the summary can say
"2.0 hours earned nothing" out loud.

## The rate had to be recorded

The formula scales from `filingsPerSecond_lastActive`, which nothing was
tracking. Schema 4 adds `run.filingsPerSecond`, and two choices in it are worth
recording:

**In `run`, not `meta`.** It describes the strength of *this* run, so a Rewind
takes it away with the formation that earned it. Otherwise the first absence
after a Rewind would pay at the old formation's rate — the player being
compensated for units they no longer have.

**A slow exponential average, not a lifetime mean.** Earning power changes as
slots are bought; a lifetime figure would still be reporting the first minute an
hour later. The 90-second window is long enough that a wave gap does not read as
a collapse in output.

The migration defaults it to **0**, which means a save carried across the
upgrade earns nothing for that absence. That is the honest default: the old
build never measured a rate, and inventing one would pay out for a number nobody
recorded.

## The summary is required to be honest

economy-spec.md §4 does not merely permit this, it asks for it: report elapsed
time, Filings earned, *and — honestly — what was missed*, because "telling the
player they lost nothing when they did is the kind of thing that erodes trust in
an idle game's numbers."

So `WelcomeBack.svelte` reports the shortfall against active play, says plainly
when time ran past the cap, and names the three gaps including that no Keys were
earned. A summary showing only the number going up would be the flattering
version, and the spec rules it out.

## Two new effect kinds arrived with their nodes

`offlineCap` and `offlineEfficiency` are Salvage's, per §4's table. Following
the rule this project keeps re-learning, they shipped with content using them —
two new Salvage nodes at tiers 4 and 5, in Sabel Ock's voice — and a test that
purchases the whole branch and asserts both values move.

## Verified in the browser

Played to build a real rate (2.40 Filings/second), destroyed the session so the
autosaver could not overwrite the fixture, backdated `savedAt` by six hours, and
reloaded:

> 6.0 hours away … **+6912 Filings** … Counted 4.0 hours … Past the 4.0 hours
> limit, 2.0 hours earned nothing … Had you been here, about 44946 more

6912 is exactly the hand-computed figure for `4h × 2.40 × 0.4 × 0.5`. The
balance went 1688 → 8600 and the summary dismissed.

## Test coverage

655 tests passing; 25 added — the formula against the spec, the halving curve,
zero and negative inputs, monotonicity across 48 hours, the cap and its reported
overflow, the Salvage widening and its ceiling, efficiency staying below parity
at every investment and length, the eight-hours-is-two claim, the reporting
threshold, the schema-4 migration, and the two new nodes reaching the
calculation.

## Carried forward

| Phase | Item |
|-------|------|
| 28 | Achievements may want an "away this long" trigger; `offlineSummary` is the hook |
| 34 | Offline nodes are tiers 4–5 of Salvage; the branch has room for more |
| 35 | `max_offline_vs_active` is an authored invariant in balancing.csv — worth asserting end-to-end once runs are long enough to measure |
| 42 | The summary is a modal on load; the real shell may want it elsewhere |
