# Phase 24: Ally/Deck Management System

**Stage 3 — Progression Systems**
Output: `progression/roster.ts`, `progression/loadout.ts`, save schema 2 and its
migration, a drag-and-drop `ui/FormationEditor.svelte`, `tests/roster.test.ts`

## Checklist

- [x] Ally inventory, unlock conditions, levelling in `progression/`
- [x] Drag-and-drop formation editor
- [x] Persisted loadouts / presets via the save system
- [x] Levelling goes live — carried from Phase 18
- [x] The formation ladder, measured rather than estimated — carried from Phase 20

## Filings buy the size of a formation, not each placement

The load-bearing decision. Growing the formation costs `slotCost(slotsUsed)`;
**moving a unit is free** and **removing refunds in full**.

Charging per placement would tax rearranging, and rearranging is the game's main
pleasure — the same argument economy-spec.md §2 makes for a free respec. What
Filings gate is *how large a machine you run*, which is the sink the cost curve
was authored for.

A test asserts the remove/re-add round trip is exactly neutral, so it can be
farmed in neither direction.

Presets live in `meta`, not `run`: an arrangement you liked should survive the
Rewind that takes the units away, or every reset means rebuilding from memory.
They store ids and slots only — never costs — so a preset saved before a Phase 34
re-balance still means what it said.

## Schema 2, and the first real migration

`meta.presets` is the first field to change shape since the schema was written.
ADR-002 built the migration machinery at schema 1 with nothing to migrate, on
the bet that retrofitting would be painful; the bet paid — the whole step is one
entry keyed on the old version, and the chain logic was not touched.

It reads `meta` defensively because migrations run on **raw parsed JSON, before
validation**: a truncated or hand-edited save must degrade to defaults rather
than throw. Five fixture tests cover it, including one asserting nothing else in
the save moves.

## The opening was broken, and measuring found why

Replacing the hardcoded Phase 10 formation with the saved one exposed a
deadlock: Filings buy slots, Filings come from kills, kills need a unit. So a
new save is granted the starting Movement for free — which `content/allies.ts`
already declared as intent ("granted on a new save so the field is never
empty").

That was not enough. The derived ladder — play stage 1 with what the game gives
you, spend what it pays, arrive at stage 2 — showed a **fresh save losing First
Shift in 12 of 16 runs even with the Beat**.

Phase 20 had estimated the stage-1 formation at five units from economy-spec §6's
unlock schedule and flagged the estimate as the thing it could not settle. The
real number is **one**.

### It was coverage, not count

The obvious fix was to lower stage 1's density. The sweep says otherwise:

| First Shift density | 2 units | 3 units |
|---|---|---|
| 42 Slack (authored) | lost 12/16 | cleared 16/16 |
| 33 Slack | lost 7/16 | cleared 16/16 |
| 27 Slack | lost 15/16 | cleared 16/16 |
| 20 Slack | lost 11/16 | cleared 16/16 |

Two units lose at *every* density; three clear at every density. Density is not
the variable. Ring placement is:

| Opening formation | With Beat |
|---|---|
| 1× Hammer on **ring 2** | lost 12/16 |
| 1× Hammer on **ring 1** | **cleared 16/16**, 0.679 Tension |
| 2× Hammer both on ring 2 | lost 12/16 |
| Hammer ring 2 + Hammer ring 1 | cleared 16/16 |

Ring 1 is the last line — the only ring that reaches the Mainspring itself
(`systems/ai.ts`, and the Phase 19 reach fix). A lone unit anywhere else watches
things walk past it.

**Stage 1's authored density was never the problem and has not been touched.**
What the grant needed was ring coverage — and, as the next section shows, more
than one unit.

## The Beat is optional — and the opening grant grew to keep it

Phase 20 verified "doing nothing is viable" (combat-spec.md §1, P1) against a
five-unit stage-1 formation. With the real economy the stage-1 formation was one
unit, and the property did not survive that:

| Opening formation | With Beat | Without Beat |
|---|---|---|
| 1 unit | cleared 16/16 | **lost 16/16** |
| 3 units | cleared 16/16 | lost 8/16 |
| **4 units** | cleared 16/16 | **cleared 16/16** |

Two documented designs were in direct conflict — P1's "the machine runs without
you" against economy-spec §6's deliberately slow unlock schedule. **P1 won**,
which is the same call Phase 17 made when it said the property wins, not the
tuning. A new save is granted four Movements.

### Where they stand was the real question

| Four Hammers | With Beat | Without Beat |
|---|---|---|
| all on ring 2 | lost 8/24 | **lost 24/24** |
| all on ring 1 | cleared 24/24 | 0.591 |
| **2 on ring 1, 2 on ring 2** | cleared 24/24 | **0.780, min 0.507** |
| 3 on ring 1, 1 on ring 2 | cleared 24/24 | 0.675 |

Two-and-two, and not only because it measures best. Splitting across rings is
what conjunction *requires* — two Movements on different rings — so the
signature mechanic can now fire in the first stage rather than at economy-spec
§6's ten-minute mark. The opening formation teaches the game's central idea by
being shaped like it.

**The slot curve is untouched.** The granted four count toward `slotsUsed`, so
the fifth Movement costs 97 — what the fifth Movement costs. A grant, not a
discount. economy-spec §6's schedule was updated to match: the first Movement is
now at 0 s because it is given, and the cost curve is introduced at the fifth.

## The editor

Full-screen on `F`, with the Phase 18 synergy preview kept inside it — that
preview *is* the planning information you want while arranging, not a separate
readout.

The slot ring is **HTML, not SVG**, unlike the Escapement Tree: drag and drop,
focus and keyboard handling all come free on real elements, and thirty
positioned circles are not a graph. Slots are drawn at their **formation** angle,
not their live rotated one — a slot is a fixed address in the machine, and
showing it spinning would make the thing you are editing a moving target.

Edits reach a running field as a **diff, not a rebuild**. Tearing the formation
down and re-creating it would reset HP and cooldowns, turning re-slotting into a
free heal mid-wave. Verified live: a Hammer damaged to 20 HP still had 20 HP
after another unit was moved.

### A bug the browser caught, and one my own carelessness caused

The Filings counter began flip-flopping between two numbers — 1702 then 5.
`syncFrom` published the *stage's earnings* while the new roster publisher
published the *spendable bank*. Those were the same number until this phase gave
Filings something to buy. The bank is now published from one place, and four
tests cover it, including that a purchase must never animate as income.

Separately: an earlier edit to `bootstrap.ts` silently did nothing, because the
replacement string did not match and nothing asserted that it had. The symptom
was an editor with no roster and zero costs. Worth the reminder that an edit
that reports success is not the same as an edit that applied.

## Test coverage

577 tests passing; 52 added — the starting grant and its ring, unlock and level
costs against the authored curves, the level ceiling, flat-not-compounding
scaling, the slot economy's free moves and neutral refunds, every placement
refusal, presets across a simulated Rewind, the schema-2 migration, the Filings
counter's semantics, levelling reaching the simulation, and a fresh save
clearing the opening stage with margin — and clearing it without a single Beat.

## Carried forward

| Phase | Item |
|-------|------|
| 25 | Chime roster and upgrade paths; `roster.ts` already treats both kinds identically |
| 26 | The Rewind clears `run.formation`; `clearFormation` is waiting for it |
| 33 | Stage 3's density still cannot be settled — it needs the ladder past zone 1 |
| 34 | Preset entries are skipped when content changes; worth a UI notice then |
