# Phase 34: Almanac Content Population

**Stage 5 — Balance & Onboarding**
Output: `content/upgrades.ts` (72 nodes), two new effect kinds with their
wiring, `tests/upgradeTree.test.ts` additions

## Checklist

- [x] Fill out the full node set across all four branches
- [x] Node descriptions in the world's tone
- [x] Balance node costs against the full prestige curve

> **Superseded terms.** PLAN.md says "offense/defense/economy/utility"; the
> branches are Aperture, Shielding, Recovery and Regulation. economy-spec.md's
> table still said Winding and Bracing — renamed in Phase 29 and missed there;
> corrected in this phase.

## The shape

72 nodes, matching economy-spec.md §2 exactly: Aperture 22 over 6 tiers,
Shielding 20 over 6, Recovery 16 over 5, Regulation 14 over 5. Base costs run
3 / 6 / 10 / 16 / 24 / 36 by tier, before the branch growth multiplier.

The fourteen nodes that already existed keep their ids, so the schema-6 id map
and every save's purchases carry across untouched.

**Every branch has three or four roots** rather than one. A single entry point
marches a player down a line; several let them choose where a branch begins. A
test asserts more than one root per branch, and that prerequisites never cross
branches — a cross-branch prerequisite would make the per-branch cost curve,
which is the thing that rewards spreading investment, meaningless.

## Two effect kinds the spec asked for and the code did not have

economy-spec.md §2 gives Regulation four remits: Flare charges **and
regeneration**, blast radius, conjunction tolerance, and **preview quality**.
Two of those had no effect kind, so the branch had three levers for fourteen
nodes and would have been padding.

- **`flareRecharge`** — a fraction off the Flare's recharge interval, clamped in
  the loop at a one-second floor. The branch may make the Flare responsive; it
  may not make it free, or P1 stops holding, because an always-available Flare
  is a Flare the game gets tuned around.
- **`previewHorizon`** — seconds added to how far ahead `timeToNextConjunction`
  looks. It buys *knowing sooner*, which is the branch's identity exactly.

Both arrived with their wiring, per the standing rule. The existing "every
effect kind has a live node" guard failed the moment they were declared and
passed again once nodes used them, which is the guard working.

## Protecting Regulation

economy-spec.md §2 singles this branch out and asks Phase 34 to keep it buying
*reach and readability, never numbers*. Two tests hold the line: no Regulation
node may grant attack, haste, defence, output, Salvage or Recollection, and each
other branch is pinned to exactly the levers the spec assigns it.

Two more caps, because both are the kind of thing that drifts:

- **At most three extra Flare charges across the whole tree.** Six charges is a
  different game from three; a dozen is a different genre.
- **Recharge reduction sums below 1.** The loop clamps it anyway, but authored
  content should not lean on a clamp to stay sane.

And the standing prohibition holds: nothing here grants control over ring
rotation. Steering was tried and removed after the Phase 10 playtest, and an
upgrade re-introducing it would re-introduce the dexterity problem with it.

## Measured against the prestige curve

A player buying greedily-cheapest, with depth following economy-spec.md §3's
cadence out to the forty-stage ladder:

| Rewind | Recollection earned | Nodes owned |
|--------|--------------------|-------------|
| 1 | 3 | 1 |
| 3 | 26 | 6 |
| 5 | 71 | 10 |
| 10 | 246 | 16 |
| 20 | 696 | 21 |
| 30 | 1146 | 23 |

**Thirty Rewinds buys 23 of 72 nodes**, and that is the growth doing its job
rather than a content gap: `1.9 ^ nodesInBranch` makes a branch's seventh node
cost 47 times its base. With free respec, the Almanac is **a loadout of about a
third of itself**, reshaped between runs — not a completion list.

That is deliberate and it reads like a bug, so there is a test for it. If a
future retune ever made the whole tree completable, the choice the design rests
on would disappear quietly.

The onboarding end is pinned exactly: a first Rewind at the first boss depth
awards 3 Recollection and the cheapest node costs 3. A player meeting the
Almanac for the first time can always buy something. One point either way and
they would be shown a menu with nothing on it.

## Flagged, not fixed

Thirty Rewinds of that curve yields roughly **+24% attack**. Roster levelling
reaches +108% per unit. So the tree is a supplement rather than the main power
axis, which sits awkwardly against economy-spec.md §1's claim that Recollection
buys *stat depth*.

Whether to steepen the payouts or restate the claim is a balance decision across
the whole economy, and this phase is content population. Recorded in
economy-spec.md §2 and carried to Phase 35 rather than resolved by quietly
doubling some magnitudes here.

## Four guards fired

All were written earlier and caught content written now.

- **Two tier-6 nodes required other tier-6 nodes.** `validateTree` requires a
  prerequisite from a lower tier; both capstones now chain from tier 5.
- **The "every effect kind has a live node" guard** failed on the two new kinds
  until nodes used them.
- **The tree-view test assumed one root per branch.** It asserted a *count*
  where it meant a *property*; rewritten to compare available nodes against
  roots directly, which is what it was always checking.
- **Two tests bought Recovery nodes as a hardcoded chain.** Filling the branch
  rewired its prerequisites and both broke for a reason unrelated to what they
  test. They now buy through `pathTo`, which is what that function is for.

## Test coverage

834 passing; 12 added — the authored shape against economy-spec's counts and
tier depths, unique names and non-empty descriptions and effects, no gaps in any
branch's tiers, base costs rising with tier, multiple roots per branch, no
cross-branch prerequisites, Regulation restricted to reach and readability, each
branch pinned to its assigned levers, the Flare-charge and recharge caps, a
first Rewind affording something, and the loadout-not-completion property.

## Carried forward

| Phase | Item |
|-------|------|
| 35 | Tree payouts versus roster levelling — +24% against +108% |
| 35 | 23 of 72 nodes at thirty Rewinds; correct by design, but unvalidated against real play |
| 36 | The Almanac view has no branch filter and no path preview affordance; `pathTo` is built and unused by the UI |
| 36 | Respec is free and implemented, and nothing in the UI tells a player that |
