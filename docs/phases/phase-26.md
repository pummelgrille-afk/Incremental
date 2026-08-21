# Phase 26: Prestige / Reset Loop

**Stage 3 — Progression Systems**
Output: `progression/prestige.ts`, `ui/PrestigeModal.svelte`,
`tests/prestige.test.ts`

## Checklist

- [x] The "go again but stronger" mechanic
- [x] What carries over vs. what resets, defined and tested
- [x] `ui/PrestigeModal.svelte` with a clear before/after preview

## The reset is a field swap, not an audit

`rewind` replaces `save.run` **wholesale** rather than clearing it field by
field. That is exactly the shape `saveSchema.ts` was written around, and it says
so: *"prestige is a field swap rather than a field-by-field audit, and a new
persistent value cannot be reset by accident."*

The payoff is structural. A future field added to `run` is cleared for free; a
future field added to `meta` survives for free. Neither needs anyone to remember
to update this function — which is the failure mode a field-by-field reset would
guarantee across the twenty-four phases still to come.

Tests assert both halves against a save carrying Keys, a levelled roster, a
purchased tree node, a Chime upgrade track, a second unlocked zone and
achievements.

## A Rewind hands the opening formation back

Not obvious, and it would have shipped broken.

The roster **survives** a Rewind, so `grantStartingLoadout` — which fires only
when the roster is empty — declines. Without something else, a Rewind lands the
player in precisely the deadlock Phase 24 found at a fresh save: no units on the
field, no Filings to buy any, and Filings only come from kills.

So `placeOpeningFormation` was split out of the first-time grant and both call
it. Same four Movements, same two rings.

## Leading with what is kept

economy-spec.md §3 turns on one claim: *a Rewind resets your power within a run,
not your access to content* — because re-traversing cleared ground is the
commonest reason players stop returning to a prestige loop.

The modal is laid out to argue that. **Kept** is the left column and lists real
counts pulled from the save; **Reset** is the right, in muted type. A modal that
opened with a list of things being taken away would argue the opposite of the
design it is presenting.

Confirmation is two-step, because the action is irreversible.

## The zero-award guard, working

economy-spec.md §1 requires that a Rewind granting nothing be blocked *with an
explanation of the threshold* — a player must never be able to burn a run for
nothing. Verified live:

> This run reached stage 2, which grants no Recollection. Reach stage 4 and a
> Rewind starts paying.

Both numbers are derived: the depth from the run, the threshold by searching the
award formula (`minimumRewindDepth`) rather than being authored beside it, so
the explanation cannot drift from the rule it explains.

## Recollection is still unobtainable in practice — and that is content, not code

Worth stating plainly, because it is the obvious next question.

The award is `floor(depth^1.6 / 8)`:

| Depth reached | Recollection |
|---|---|
| 1–3 | **0** |
| 4 | 1 |
| 6 | 2 |
| 8 | 3 |

**Zone 1 tops out at scaling index 3.** So the loop is complete and tested, and a
player still cannot earn a single Recollection — the deepest stage that exists
sits one below the threshold.

This is the curve behaving correctly against one eighth of the intended content:
economy-spec.md §3's cadence table targets the first Rewind at depth ~8, and
Phase 33 authors the remaining zones. Nothing here should be re-tuned to
compensate; doing so would fit the exponent to a content gap rather than to the
game.

The practical consequence is that **the Escapement Tree also stays empty until
Phase 33**, since Recollection is what buys it.

## The dev gate is an argument, not an environment check

`isRewindUnlocked` stays a pure function of the save. `rewindPreview` and
`rewind` take the gate as an **argument** defaulting to it, and `bootstrap`
passes `|| import.meta.env.DEV`.

Reading `import.meta.env.DEV` inside the pure function would have been simpler
and would have made every test of the gate vacuous, since Vitest runs with DEV
true. The same trap the Phase 20 telemetry strip test fell into, avoided by
keeping the environment at the edge.

## Test coverage

630 tests passing; 26 added — the boss gate in four states, the zero-award guard
and its threshold, every field that resets, every field that persists (including
Chime tracks and zone unlocks), the opening formation coming back, the preview
matching what the Rewind actually pays, the Salvage bonus reaching the quote,
preview purity, and the award's super-linearity against §3's cadence table.

## Carried forward

| Phase | Item |
|-------|------|
| 27 | Offline Filings; `run.startedAt` is stamped fresh by every Rewind |
| 32 | The boss that opens the gate for real |
| 33 | Zones past the first — until then no Rewind can pay |
| 35 | The 1.6 exponent, re-measured against real run lengths |
| 42 | The modal is on `P`; the real shell may want it elsewhere |
