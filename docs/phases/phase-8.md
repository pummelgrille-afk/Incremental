# Phase 8: Project Architecture Setup

**Stage 1 — Technical Foundation**
Output: `src/lib/entities/*`, `src/lib/content/*`, `src/lib/core/stageLoader.ts`,
`src/lib/core/simulation.ts`, conventions in `CLAUDE.md`, tests in `tests/`

## Checklist

- [x] Folder skeleton under `src/lib/` (created in the Phase 7 restructure)
- [x] Barrel file where useful — **exactly one**, `entities/index.ts`, type-only
- [x] Base TypeScript interfaces in `src/lib/entities/`
      — `Movement`, `Chime`, `Slack`, `Projectile`, `Mainspring`, plus `Wave`,
      `Zone` and shared `types`
- [x] Concrete content in `src/lib/content/` typed against those interfaces
- [x] Scene/stage-loading architecture — `core/stageLoader.ts` reads a zone/stage
      definition from `content/zones.ts` and initializes the simulation
- [x] No per-stage Svelte routes
- [x] Naming and coding conventions established in `CLAUDE.md`

## Decisions locked

### Domain vocabulary over generic names

PLAN.md's `Ally`/`SupportUnit`/`Enemy`/`Objective` become
`Movement`/`Chime`/`Slack`/`Mainspring`, matching `docs/design/narrative.md`. The
mapping table is in `CLAUDE.md` so PLAN.md references stay traceable.

**Cost accepted:** "Movement" collides with movement-as-motion, which
`systems/ai.ts` will be full of. Resolved by convention — the noun always means
the entity; motion uses `motion`/`velocity`/`advance`. Documented rather than
left to chance.

### Def / Instance split

Every entity type splits into an immutable `XDef` (authored content, referenced
by stable string id) and a mutable `XInstance` (runtime state holding a
`readonly def` back-reference). Saves store ids, never objects — which is what
makes the schema migration story in ADR-002 tractable.

`Projectile` deliberately has **no Def**: projectiles are not authored content,
they are produced by pattern functions in `systems/patterns.ts`.

### One barrel, not per-directory barrels

`entities/index.ts` only, and type-only so it contributes nothing to the bundle.
Entity types are imported nearly everywhere, so a single entry point earns its
keep; elsewhere barrels invite import cycles and defeat tree-shaking. Enforced by
test.

### Stages are data, not routes

`loadStage(address)` returns a fresh `SimulationState`. Changing stage swaps the
state the systems read — it never remounts the UI or rebuilds the Pixi scene.

`validateStage()` runs at load, so a typo in wave content fails immediately
rather than thirty seconds into a wave.

### Field geometry moved into content

`content/field.ts` now owns ring radii, slot counts, periods, nudge and
conjunction constants, mirroring `balancing.csv`. The Phase 7 harness duplicated
these; it now imports them, so there is a single source of truth.

## A spec bug the tests caught

`tests/damageTypes.test.ts` asserts economy-spec.md invariant 3 and the
two-pairs-not-a-cycle structure. It immediately failed against the matrix in
**combat-spec.md §7**, which was asymmetric:

- `Seized` had **no** unfavourable matchup — nothing hit it for less than ×1.0.
- `Rigid` had **two** (Shear and Resonant).

Resonant's unfavourable matchup moved from `Rigid` to `Seized`. Every armour
class now has exactly one favourable and one unfavourable counter, and so does
every damage type. `combat-spec.md` was corrected in the same commit.

The new arrangement is also better design: Chimes are always Resonant, so they
are strong against fast `Erratic` Slack and weak against slow armoured `Seized`
— grinding down armour is the front line's job, not the rim's.

## Boundary enforcement

`tests/boundaries.test.ts` mechanically enforces `docs/architecture.md`:

- `entities/`, `systems/`, `content/`, `progression/`, `utils/` import neither
  Svelte nor Pixi
- Pixi appears only in `core/render.ts`
- `core/` imports no Svelte
- `content/` never reaches upward into `systems/` or `core/`
- exactly one barrel exists

Verified to actually fail by injecting a deliberate `import { mount } from
'svelte'` into `entities/types.ts` and confirming the suite went red, then
removing it.

## Test suite

`--passWithNoTests` (added in Phase 6 as a stopgap) is **removed** — there are
real tests now.

| File | Covers |
|------|--------|
| `tests/stageLoader.test.ts` | Resolution, load, validation, content integrity, scaling monotonicity |
| `tests/damageTypes.test.ts` | Type matrix, balance invariants, conjunction scale |
| `tests/boundaries.test.ts` | Architectural layer rules |

30 tests passing. `npm run check`: 790 files, 0 errors.

## Placeholders left for later phases

| File | Real content lands in |
|------|----------------------|
| `content/enemies.ts` | Phase 31 (3 Slack sketched) |
| `content/zones.ts` | Phase 33 (1 zone, 2 stages sketched) |
| `content/allies.ts` | Phase 29 — not yet created |
| `content/supportUnits.ts` | Phase 30 — not yet created |
| `content/upgrades.ts` | Phase 34 — not yet created |
| `content/bosses.ts` | Phase 32 — `validateStage` skips boss ids until then |

Epigraphs in `content/zones.ts` are final copy from `narrative.md`; stage layouts
are not.
