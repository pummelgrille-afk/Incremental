# Phase 23: Upgrade Tree UI

**Stage 3 — Progression Systems**
Output: `ui/UpgradeTree.svelte`, layout and path-preview in
`progression/upgradeTree.ts`, the reveal gate

## Checklist

- [x] Pannable / zoomable tree view
- [x] Locked / available / purchased node states
- [x] Tooltips in the world's voice, pulled from `content/upgrades.ts`
- [x] Path-preview for planning spend

## Layout is derived, not authored

Nodes have no coordinates in content. `treeLayout()` computes them: **radial,
because the game is an orrery** — four branches take a quadrant each and tiers
step outward, so investing in a branch reads as winding that arm of the
mechanism further out.

Hand-placing coordinates would look better for twelve nodes and become a
liability at seventy-two, where every insertion means re-nudging its neighbours.
Tests assert tiers move outward, branches never overlap, and nothing lands on
the reserved centre.

Drawn in **SVG, not Pixi**. This is a menu, not the field: it wants crisp text
and hit-testing at any zoom, and it must never compete with the simulation for
the render budget.

## The path preview is a backend function

PLAN.md asks for "path-preview for planning spend". The obvious implementation —
sum the current cost of each prerequisite in the component — is wrong, and
wrong in the worst direction.

Each purchase raises its branch's depth, so the second node in a chain is dearer
than it looks today. On the authored Winding branch:

| | |
|---|---|
| Sum of today's prices | 21 |
| **Actual cost of the chain** | **59** |

A planning affordance that under-quotes by 3× is worse than none. `pathTo` walks
the branch curve forward against a scratch tally — asking the question never
changes the answer — and a test asserts the quote exceeds the naive sum.

## The reveal gate, implemented rather than deferred

economy-spec.md §3: the tree is **hidden entirely** until the first boss clear,
because a first-time player should meet exactly one progression system at a
time. That was easy to skip while building the view, so it is implemented now:
`isTreeRevealed` gates the `T` key and the HUD hint alike.

Two ways in — any boss stage cleared, which is the authored condition, or a
Rewind completed, which makes the gate robust to Phase 26 landing before Phase
32's bosses.

**The consequence is that the tree is currently unreachable on every save**, and
that is correct rather than broken. Recollection is only awarded by Rewinding,
which Phase 26 builds — so a visible tree today would be a menu of things nobody
can buy, in a currency nobody can hold.

## Verified in the browser

The gate made the interesting parts awkward to reach, so verification was done
in two passes.

Before the gate: twelve nodes at four exact diagonals, tiers at radius 130 / 240
/ 350, eight prerequisite edges, four roots reading `unaffordable` and the rest
`locked` — correct for a save with no Recollection. Selecting the tier-3 Winding
node highlighted all three nodes and both edges of its chain and quoted **59
Recollection for 3 nodes**, with the buy button correctly disabled.

After the gate, with the reveal temporarily forced: opens on `T`, hint appears,
whole tree inside the viewport, respec disabled with nothing to refund. Zoom
0.85 → 0.952 per notch and clamping at the 0.35 floor; pan tracking the pointer
exactly; recentre restoring both.

### One layout bug the browser caught

The tree rendered centred on SVG `(0, 0)` — which is the **top-left corner** —
so most of it hung off the viewport. The fix measures the element rather than
assuming a size, since the canvas is a grid column whose width depends on the
window.

### A purchase could not be exercised end-to-end

Seeding Recollection into `localStorage` does not survive: the autosaver flushes
on page hide, so the running app overwrites the seeded value before the reload
reads it. Three attempts, three overwrites.

The purchase path is covered by unit tests instead — cost deduction, refusal
when locked or unaffordable, no double-buy — and the UI's *refusal* was verified
live. What has not been seen in a browser is a successful buy. Phase 26 makes
Recollection obtainable and that is the natural moment to check it.

## Test coverage

526 tests passing; 16 added — path ordering, the curve-walking quote against the
naive sum, path shortening as prerequisites are bought, purity, affordability
against the whole path, layout invariants, and the reveal gate in all four
states.

## Carried forward

| Phase | Item |
|-------|------|
| 24 | Respec's "between runs" gate currently keys on `game.running`; the real answer arrives with the Rewind |
| 26 | Recollection becomes obtainable — verify a purchase end-to-end then |
| 32 | The boss that reveals the tree |
| 34 | Seventy-two nodes; the layout is built for it but has never been seen at that size |
| 42 | The tree is currently a full-screen overlay on `T`; the real shell may want it elsewhere |
