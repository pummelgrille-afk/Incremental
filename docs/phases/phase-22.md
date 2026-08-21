# Phase 22: Upgrade Tree System (Backend)

**Stage 3 — Progression Systems**
Output: `entities/Upgrade.ts`, `content/upgrades.ts`, `progression/upgradeTree.ts`,
effects wired through the simulation, `tests/upgradeTree.test.ts` and
`tests/upgradeEffects.test.ts`

## Checklist

- [x] Node-graph structure with prerequisites, tiers, branches
- [x] Unlock logic
- [x] Cost scaling
- [x] Respec rules
- [x] Wired to the Phase 9 save schema

## What this phase is not

**Phase 34 authors the ~72 nodes.** What is here is a starter set — three per
branch — chosen so the machinery is exercised rather than to be balanced
content: every branch gets a root and a two-deep chain, and **every effect kind
has at least one node using it**, so nothing in the type is untested
configuration.

## The graph

A node names its branch, tier, prerequisites, base cost and effects. Purchases
are stored as **a set of ids** in `meta.purchasedNodes` — never objects, never
with their costs.

That last part matters more than it looks. Cost is recomputed from how many
nodes the branch already holds, so re-balancing the curve in Phase 34 cannot
strand a save that was priced under the old one. `refundValue` prices purchases
back *down* the same curve for the same reason: remembering what was paid would
let a player bank the difference across a cost change, or lose out to one.

`validateTree` is run by test rather than at load — a broken tree is a content
bug to fail loudly on, not something to discover in someone's save. It catches
unknown prerequisites, cross-branch prerequisites, tier inversions, nodes that
do nothing, duplicate ids, branches with no root, and prerequisite cycles.

The cycle check is not redundant with the tier check: tiers forbid cycles only
while tiers are authored correctly, and a cycle would hang whatever traversal
Phase 23's tree view does.

## Cost keys on the branch, not the tree

```
cost = baseCost × 1.9^(nodes already owned in this branch)
```

Keying on the branch is what makes spreading investment cheaper than driving one
branch deep. That is the intended shape: a specialist build pays for the
privilege rather than being handed it. A test asserts the same node is cheaper
after buying into a *different* branch than after buying into its own.

## Respec is free, and exactly neutral

economy-spec.md §2: charging for a respec would punish experimenting with
formations, which is the game's main pleasure — the cost of a wrong build is
already the time spent on it.

A test buys three nodes, respecs, and rebuilds the identical tree, asserting the
Recollection balance is unchanged. If that round trip were not exactly neutral,
repeated respeccing would be either a leak or a tax.

**"Only between runs" is the caller's check.** This module cannot see whether a
stage is in progress, and giving it a way to would put run state into something
that deliberately only knows about the save.

## Effects are additive, and they are wired

Across ~72 nodes multiplicative stacking compounds past any curve balancing.csv
can hold — the same reason economy-spec.md §7 caps the type matrix at 1.5×. So
`effectsOf` sums.

The aggregate is read **once, at stage load**, and carried on `SimulationState`.
Systems read `sim.effects`; they never see the save. Purchases mid-stage cannot
change a run in progress, which is also what keeps a run reproducible from its
seed.

| Branch | Effect | Consumed by |
|---|---|---|
| Winding | attack, haste | `buffs.ts` → `combat.ts`, `ai.ts` |
| Winding | conjunction potency | `synergy.ts` |
| Bracing | tension | `stageLoader.ts` |
| Bracing | defence, block arc | `combat.ts`, `collision.ts` |
| Salvage | filings, recollection | `currencies.ts` via `bootstrap.ts` |
| Salvage | repair cost | `currencies.ts` → `loop.ts` |
| Regulation | beat charges, blast radius | `stageLoader.ts`, `loop.ts` |
| Regulation | conjunction tolerance | `synergy.ts` |

`tests/upgradeEffects.test.ts` exercises each one against the system that
consumes it. Those are the tests that fail if a wiring is dropped; the
content-integrity checks would not notice.

The strongest of them asserts a **neutral tree produces a byte-identical run** to
no tree at all — threading effects through eight systems must not perturb a save
that has bought nothing.

Two smaller decisions worth recording. Tree haste is **additive with a
conjunction haste buff**, not multiplicative, following the Phase 18 stacking
argument: two sources of the same thing must not compound. And beat charges are
**floored** — a charge is spendable or it is not, so 1.9 grants one.

## Regulation's identity is now a test

economy-spec.md §2 asks Phase 34 to protect Regulation as the branch that buys
*reach and readability*, not numbers. Two tests make that a guard rather than an
intention: no Regulation node may grant attack, defence, tension or haste, and
**no node anywhere may grant anything matching ring rotation or steering** —
combat-spec.md §1 forbids that outright, including via upgrades, because it
would re-introduce the dexterity problem the Phase 10 playtest found.

## A bug only the browser caught

`Cannot access 'currentEffects' before initialization`.

The per-frame `effectsOf` walk was cached behind a closure, and the closure was
declared *after* `buildSimulation` — which is a hoisted function declaration
called at `let simulation = buildSimulation()` above it. A textbook temporal
dead zone.

510 tests passed through it: `core/bootstrap.ts` is the DOM layer and has no
unit coverage, so nothing but loading the page would have found it. Worth
remembering that the browser check is not a formality on this file specifically.

## Test coverage

510 tests passing; 47 added. Graph validation in both directions, prerequisites
and blocked-reason reporting, branch-keyed cost growth, refusal to overspend or
double-buy, a neutral respec round trip, additive effect accumulation, unknown
ids surviving a content change, and every effect kind against its consumer.

## Carried forward

| Phase | Item |
|-------|------|
| 23 | The tree view consumes `treeStatus`; `blockedBy` is the state it renders |
| 23 | Respec needs a "between runs" gate — this module deliberately cannot provide it |
| 26 | The Rewind is where respec becomes reachable; the tree is hidden until the first boss clear |
| 34 | The full ~72 nodes, and cost balance against the real prestige curve |
| 34 | New effect kinds arrive with their wiring, not before it |
