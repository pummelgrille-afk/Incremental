# Phase 25: Support-Unit Roster & Upgrade System

**Stage 3 — Progression Systems**
Output: `progression/support.ts`, save schema 3 and its migration, a Chime panel
in `ui/FormationEditor.svelte`, `tests/support.test.ts`

## Checklist

- [x] Support-unit inventory — already shared with allies in Phase 24's `roster.ts`
- [x] Upgrade paths, **distinct in feel from front-line allies**
- [x] Cost balanced against ally costs
- [x] Integrated into `FormationEditor.svelte`

## The inventory was already done

Phase 24's `roster.ts` treats Movements and Chimes identically — unlock with
Keys, level with Keys, one ledger each. So the inventory half of this phase
arrived early, and what was actually owed is the sentence PLAN.md puts in the
middle: **distinct in feel from front-line allies.**

Shipping Chimes as "Movements you level, but on the rim" would have satisfied
the checklist and missed the point.

## Chimes are shaped, not levelled

A Movement **levels**: one lever, uniformly stronger. A Chime picks between three
tracks that pull against each other for the same scarce Keys:

| Track | Buys | Bounded at |
|---|---|---|
| **Capacity** | +1 shot held at once — burst | 3 |
| **Winding** | −0.5 s recharge — sustain | 2 |
| **Resonance** | +15% attack — punch | 3 |

Two of the three are about **Charge**, because Charge is what makes a Chime a
Chime (combat-spec.md §4). The decision has a different *shape* from levelling,
not merely different numbers on the same lever — which is what "distinct in
feel" has to mean if it means anything.

Tracks are priced independently: spending on Capacity does not make Winding
dearer. They are separate shapes, not one shared level, and a test asserts it.

## Winding cannot cross the class-balance lever

`chargeInterval` is not an ordinary stat. Phase 14 measured it as **the balance
lever between the two unit classes**: at 4 s a Chime is strictly better per
Filing than the Movements it competes with, 6 s is the crossover, 7 s tips the
other way. That measurement is why the authored value is 6.

An upgrade that could wind past 4 s would stop being a trade and start being a
strictly correct purchase. So:

- the track caps at **2 levels**, putting a fully wound Chime at **5 s** —
  better, and still short of dominant;
- and `supportStats` **floors at 4.5 s independently of the cap**, so a later
  re-balance that widens the level cap cannot cross the lever by accident.

Three tests cover it, including one that sets the track to level 99 directly in
the save and asserts the floor still holds.

## Upgraded stats ride on the instance

`ChimeInstance` gained `maxCharge`, `chargeInterval` and `attackScale`, and
`ai.ts`, `loop.ts`, `render.ts` and `scaling.ts` now read those rather than
`chime.def.*`.

A def is **immutable shared content** (CLAUDE.md). A save that has bought
upgrades must never be able to write into the roster every other save reads, and
resolving upgrades at each read site would mean threading the save into
`systems/`, which is exactly the boundary `progression/` exists to keep.

`createChime` takes the stats as an optional argument defaulting to the def's own
numbers, so a caller with no save — a test, or the loader — gets an unupgraded
Chime without having to know tracks exist.

One consequence worth noting: **Phase 19's difficulty director reads the upgraded
economy**. `formationPower` rates a Chime by Charge, so an upgraded one raises
the pressure the director measures, and an over-invested build gets the extra
enemies it has earned. A test asserts that.

## Schema 3

`meta.chimeUpgrades`, keyed by def id then track. Kept separate from `chimes`
(which holds unlock state) because the two answer different questions.

Second migration, and deliberately the same boring shape as the first: a new
field with a safe empty default, `meta` read defensively because migrations run
on raw parsed JSON before validation. A test now carries a **schema 1** save all
the way to current in one call and asserts both steps applied — the whole point
of a chain being that an old save need not be opened by every intermediate build.

## Verified in the browser

Locked Chime shows as locked with its tracks hidden. Unlocking reveals three
tracks with live stats (`3 charge · 6s`) and independent prices, and the buy
button correctly refuses at 1 Key against a 2-Key track.

Getting there needed the unlock cost temporarily lowered — a real run had 2 Keys
from two first clears against Quarter Bell's cost of 4, which is the unlock
curve working as authored rather than a problem.

## Test coverage

604 tests passing; 27 added — the three tracks and their independence, per-track
cost growth, ceilings, refusals, the winding floor under three different
attacks, upgraded stats reaching a live Chime's charge economy and regeneration
rate, the director reading them, the schema-3 migration, and the full 1 → 3
chain.

## Carried forward

| Phase | Item |
|-------|------|
| 26 | `investedIn` exists for the Rewind's before/after preview |
| 30 | Four to six launch Chimes; the tracks are per-def already |
| 30 | A second Chime is what will show whether three tracks is the right number |
| 35 | The winding floor is a measured bound — re-measure it if `chargeInterval` moves |
