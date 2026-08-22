# Architecture

> Started in Phase 7. Phase 8 added the module skeleton and interfaces; Phase 11
> added performance budgets. Design decisions live in `docs/design/`; this file
> covers *technical* structure.

## Stack

| Layer | Choice | Fixed in |
|-------|--------|----------|
| Build | Vite 8 | Pre-existing |
| Language | TypeScript 6 | Pre-existing |
| UI framework | Svelte 5 (runes) | Pre-existing |
| Simulation rendering | **PixiJS 8 (WebGL)** | Phase 7 |
| Persistence | **localStorage** | Phase 7 |
| Unit tests | Vitest 4 | Phase 45 expands |
| E2E | Playwright | Phase 45 |

---

## ADR-001 — PixiJS over Canvas 2D for the simulation layer

**Status:** Accepted (Phase 7)

### Context

The simulation draws three rotating rings of units, a central objective, and a
projectile budget of 600 (tuning range to 1200 — `balancing.csv`). Phase 40 adds a
full VFX library on top. PLAN.md rules out DOM-per-entity, leaving Canvas 2D or a
WebGL library.

### Decision

**PixiJS 8**, using WebGL.

### Rationale

1. **Rotation is the core mechanic, and it is the expensive case in Canvas 2D.**
   Every unit sits on a turning ring. Canvas 2D requires
   `save/translate/rotate/drawImage/restore` per rotated sprite, scaling linearly
   with entity count. Pixi's scene graph maps directly onto the design: one
   `Container` per ring, one `rotation` write per frame, and every child follows.
   Rotation cost becomes **O(rings), not O(units)** — measured below.
2. **The art direction needs glow.** `pillars.md` P4 specifies warm brass on a dark
   field with projectiles that must stay readable. In Canvas 2D that means
   `shadowBlur`, among the slowest operations in the API. In Pixi it is a filter or
   an additive-blend sprite.
3. **Phase 40 requires particles.** Particle counts are where Canvas 2D stops
   holding 60 fps, and the VFX library is not optional content.
4. **Texture atlases (Phase 39) are native to Pixi.** Canvas 2D would mean
   hand-rolling atlas slicing and animation frame timing.

### Measured evidence

Harness in `src/lib/core/render.ts`, run in Chrome on an NVIDIA RTX 3060
(ANGLE / D3D11) at 1280×720, resolution 1. Each figure is `step() + render() +
gl.finish()` — GPU sync forced, so this is real draw cost rather than command
queueing. 200 samples per tier after a 30-frame warm-up.

| Projectiles | Median | p95 | Worst | % of 16.67 ms frame (median) |
|-------------|--------|-----|-------|------------------------------|
| 200 | 0.20 ms | 0.50 ms | 0.90 ms | 1.2% |
| **600** *(budget)* | **0.30 ms** | 0.50 ms | 1.00 ms | **1.8%** |
| 1200 *(budget max)* | 0.50 ms | 0.80 ms | 1.20 ms | 3.0% |
| 2400 *(2× over)* | 1.80 ms | 3.00 ms | 4.50 ms | 10.8% |

Rendering consumes under 2% of the frame budget at the design target, and stays
under 11% at double the maximum. Headroom is ample for the simulation, VFX and UI
work that has to share the frame.

**Caveat:** an RTX 3060 is not a low-spec target. These numbers establish that the
approach is sound, not that the budget is safe on integrated graphics. Phase 11
sets real budgets and Phase 46 stress-tests them; both should re-measure on weaker
hardware before the numbers in `balancing.csv` are treated as final.

**Container-per-ring verified.** A single write to `ringContainer.rotation` moved a
unit's global position from `(718, 315)` to `(685, 438)` while its local
coordinates stayed `(90, 0)` and were never written. Six units on ring 1 moved from
that one write. The claim holds.

### Consequences

- **Bundle grew from 9.7 kB to 157.2 kB gzipped** (530 kB raw) — Pixi's share is
  roughly **148 kB gzipped**, at the top of the range estimated when the decision
  was taken. Acceptable for a game that will ship sprite atlases anyway, but Phase
  39 must count Pixi when watching total asset size, and this is now the floor for
  first load.

  Vite code-splits Pixi across seven chunks. That is worth revisiting in Phase 46:
  if any are genuinely optional at boot, the initial payload can shrink.
- **WebGL context loss must be handled.** Pixi does not recover automatically.
  Phase 46 owns this: listen for `webglcontextlost`, pause the simulation, rebuild
  on restore. The simulation is plain TS and holds no GPU state, so a rebuild loses
  nothing.
- **A dependency with its own upgrade path.** v7→v8 changed the init API; expect
  similar churn. Pinned to `^8.20.0`.
- **Renderer choice is now expensive to reverse.** Every Stage 2 draw path is
  written against Pixi.

### Rejected: Canvas 2D

Would have been simpler at Phase 10, where everything on screen is a circle — and
that is exactly the trap. The renderer has to be chosen for Phase 40's
requirements, not Phase 10's, because swapping it means rewriting every draw path
built in between.

---

## ADR-002 — localStorage for persistence

**Status:** Accepted (Phase 7)

### Context

The save must cover resources, the ~72-node upgrade tree, the unlocked roster with
levels, achievements, statistics and settings (`economy-spec.md`). Estimated
serialized size was **5–20 kB**; Phase 9 measured it and the estimate held.

### Decision

**localStorage**, with a versioned schema and corruption-safe writes.

### Rationale

- 5–20 kB sits far inside the ~5 MB per-origin budget. IndexedDB solves a size and
  binary-blob problem this game does not have.
- Synchronous access keeps save/load logic simple and makes the write-validate-swap
  pattern straightforward. An async store would push promise handling into the tick
  loop's autosave path for no benefit.
- No server component, so no cloud-save concerns.

### Requirements this places on Phase 9

1. **`schemaVersion` from the first write.** Migrations are cheap to design now and
   painful to retrofit.
2. **Corruption-safe writes.** Serialize to a temp key, validate by parsing it
   back, then swap into the live key. Retain the previous value as a
   last-known-good backup.
3. **Export/import as a save string.** localStorage is destroyed by "clear browsing
   data" — a routine action that would silently erase 25–40 hours of progress
   (`economy-spec.md` pacing). Players need a way to hold their own backup. This is
   a requirement, not a nice-to-have.
4. **Timestamp every save** — offline progress (Phase 27) reads the delta.
5. **Guard quota failures.** A failed write must never break the tick loop.

### Measured in Phase 9

Built a save representing a completed game — all 72 tree nodes, 16 Movements and
6 Chimes at level 25, 40 achievements, 6 zones with 10 cleared stages each, a full
formation and all rim mounts — and wrote it through the real localStorage backend
in Chrome.

| | Size |
|---|---|
| Default (new game) | 733 bytes |
| Completed game, serialized | 6,914 chars (**13.8 kB** as UTF-16) |
| With the backup key | **27.7 kB** |
| Share of a 5 MB origin quota | **0.53%** |
| Export string | 9,238 chars |

Two orders of magnitude inside the quota, so the decision holds comfortably and
IndexedDB stays unnecessary.

**One thing to watch:** the export string is ~9 kB of base64 at end-game. That is
a long paste to move through a chat window or a text field, and the failure mode
is truncation — which the checksum catches, but only after the player has already
lost the copy. If Phase 43 finds this awkward in practice, deflating the JSON
before base64 would cut it substantially; the format is versioned, so that is an
additive change.

### Migration path

If saves later grow past ~1 MB — detailed statistics history, replays — move to
IndexedDB behind the same interface in `core/save.ts`. Callers should not know
which backend is in use, so `save.ts` exposes only `load()`, `save()`, `export()`,
`import()`.

---

## Scope: web-only

This targets the browser. **Tauri/Electron wrapping is out of scope** unless
explicitly revisited, per PLAN.md Phase 7. Three consequences follow, recorded here
so later phases do not have to re-derive them:

| Phase | Consequence |
|-------|-------------|
| 9 | No native filesystem. localStorage plus a copy-paste save string is the whole persistence story. |
| 28 | No platform achievement API. Achievements are tracked in the save file only. |
| 47 | Static hosting with a GitHub Actions build-and-deploy on push to `main`. No installer, no code signing, no store submission. |

Revisiting this is a meaningfully different track and should be flagged before any
work starts, not discovered mid-phase.

---

## Layer boundaries

The rule from `CLAUDE.md`, made concrete:

```
┌──────────────────────────────────────────────────────────┐
│  src/lib/ui/*.svelte        DOM chrome: HUD, panels,     │
│                             menus, tooltips              │
│  src/lib/ui/primitives/     the shared set they are      │
│                             built from (Phase 42)        │
│         ▲ reads                                          │
│  src/lib/stores/            thin reactive projection     │
│         ▲ published once per tick (step 11)              │
├──────────────────────────────────────────────────────────┤
│  src/lib/core/     tick loop, RNG, save, stageLoader     │
│  src/lib/systems/  combat, ai, spawn, collision, synergy │
│  src/lib/entities/ Movement, Chime, Slack, Projectile    │
│  src/lib/content/  typed data                            │
│         │ plain TypeScript — imports no framework        │
│         ▼ read by                                        │
│  src/lib/core/render.ts     Pixi scene, one canvas       │
│  src/lib/core/audio.ts      Web Audio graph              │
└──────────────────────────────────────────────────────────┘
```

**Three rules that must not erode:**

1. Nothing under `core/`, `systems/`, `entities/` or `content/` imports Svelte,
   Pixi *or* a browser API. Those modules must stay runnable in a plain Vitest
   process with no DOM — that is what makes combat math and prestige logic
   testable in Phase 45.

   **The output layer is the exception, and it is exactly two files:**
   `core/render.ts` (Pixi) and `core/audio.ts` (Web Audio). Both sit at the
   bottom of the diagram for the same reason — they are where the projection
   leaves the program — and both are kept as thin as the job allows. Everything
   *decidable* about what is drawn or heard lives beside them in modules that
   import nothing: `core/animation.ts`, `core/backdrop.ts`, `core/audioMix.ts`
   and the `content/` tables they read.

   The test for whether something belongs in the exception is narrow: does it
   need the API to answer the question? Choosing a frame does not. Choosing a
   bus gain does not. Building a filter node does.
2. `stores/` is the only bridge into Svelte, written once per tick at step 11 of
   the order in `combat-spec.md` §8.

   **A primitive never crosses it.** Nothing under `ui/primitives/` may import
   `stores/`: a primitive that reads `game` is a screen with fewer props, usable
   only where that state means what it meant the first time. Screens read the
   projection and hand primitives plain values. Checked by `tests/ui.test.ts`
   along with the rest of `docs/design/ui-spec.md`.
3. `render.ts` **reads** simulation state and never writes it. Rendering is a pure
   projection; a dropped frame must never change the simulation.

   Phase 43's screen shake is the test case for this rule rather than an
   exception to it: it needs to know that Output fell, so it keeps its *own*
   previous value and its own `Math.random`, and writes nothing back. Two
   frames dropped mean a shake that never fired, which is the correct failure.

The renderer and the simulation therefore run at different rates by design — a
fixed-timestep simulation with rendering interpolating between states. Phase 10
establishes the pacing.

## Performance budgets

**Set in Phase 11 from measurement, not estimate.** Reference machine: Chrome on
an NVIDIA RTX 3060 (ANGLE / D3D11), 800x600 canvas.

### Where the time actually goes

| Slack on field | Live bullets | Sim | Render | Combined | % of 60 fps frame |
|---|---|---|---|---|---|
| 300 | 594 | 0.0 ms | 2.9 ms | 2.9 ms | 17% |
| 600 | 593 | 0.0 ms | 4.6 ms | 4.6 ms | 28% |
| 1000 | 573 | 0.0 ms | 6.8 ms | 6.8 ms | 41% |
| 1500 | 564 | 0.0 ms | 9.9 ms | 9.9 ms | 59% |
| 2500 | 524 | 0.0 ms | 17.0 ms | 17.0 ms | **102% — breaks** |

**Simulation cost is unmeasurable at every tier** — it does not reach 0.1 ms even
with 2500 entities and a saturated projectile pool. Rendering is effectively
100% of the frame cost. Every optimisation decision follows from that.

### The Phase 11 render fix

Isolating per-entity cost from the deltas showed Slack costing **~12 us each per
frame** against **~4 us** for a projectile. The difference was that `drawSlack`
called `clear()` and rebuilt geometry every frame, for entities that mostly were
not changing.

`render.ts` now keeps a signature per Slack (hit-flash, shield, health quantised
to 20 steps) and rebuilds geometry only when it changes. Telegraphing Slack are
exempt because they animate, but only a handful telegraph at once.

Result: **2.1x across the board.** Per-Slack cost fell to ~5.8 us and the ceiling
moved from ~1200 concurrent Slack to ~2200.

Verified lossless by pixel comparison: an idle frame re-rendered differs by
**0 pixels**, while damage (110 px), hit-flash (396 px) and telegraph (388 px)
each redraw correctly.

### The budgets

Defined in `src/lib/content/budgets.ts`, mirrored in the `budget` rows of
`balancing.csv`.

| Budget | Value | Kind |
|--------|-------|------|
| Concurrent Slack | **200** | Content constraint |
| Live projectiles | **600** | Runtime cap |
| Particles (Phase 40) | **400** | Content constraint |
| Units (Movements + Chimes) | **38** | Structural — equals total slots + rim mounts |
| Frame safety factor | **0.6** | 10 ms of the 16.67 ms frame |

**Content constraints are enforced by test, not by clamping at runtime.**
Silently truncating a wave would change authored difficulty invisibly, which is
a worse failure than a brief frame dip. `tests/budgets.test.ts` walks every
authored stage and asserts worst-case concurrent spawns stay inside the budget.

**The projectile budget is the one exception**, and is a genuine runtime cap:
patterns emit far more than content can predict, and refusing a bullet degrades
gracefully where refusing a spawn would rewrite the encounter.

### Low-spec margin

At the 200-Slack budget the reference machine spends roughly **2.4 ms** of its
16.67 ms frame. That leaves about **7x headroom**, so a machine up to ~7x slower
than an RTX 3060 still holds 60 fps at full budget. Integrated graphics
typically land inside that.

This is an *extrapolation, not a measurement*. Phase 46 owns the real low-spec
pass and should re-measure on actual hardware before the numbers are treated as
final. A 30 fps floor on the weakest targets is an acceptable fallback; 60 fps
on mid-range is not negotiable.

### Object pooling

`utils/pool.ts` is a fixed-capacity pool used for projectiles, which churn
hundreds per second.

**Enemies and support units are deliberately not pooled**, which departs from
PLAN.md Phase 11. The measurement above is the reason: simulation cost is
unmeasurable, so pooling them would optimise something that costs nothing while
forcing `SlackInstance.def` and `.id` to become mutable and breaking the
Def/Instance convention from Phase 8. Revisit only if profiling ever shows
allocation pressure — it does not today.

### Profiling

`F2` toggles the in-game diagnostics overlay: fps, frame/sim/render split, live
and peak counts against budget, refused spawns, and ticks spent over budget. The
setting persists via `settings.showFps`, so a profiling session survives a
reload.

Counters that go red mean something specific:

- **refused** — the projectile pool hit its cap; bullets were dropped.
- **over budget** — ticks spent above the Slack budget; a content bug.
- **render** — the frame is over the safety factor.

## Module map

Established in Phase 8. Directories not listed are still empty skeletons.

| Module | Owns | Phase |
|--------|------|-------|
| `entities/types.ts` | Shared primitives: ids, slots, damage/armour unions, targeting policies | 8 |
| `entities/Movement.ts` | Front-line ally def + instance, formation bonuses, conjunction effects | 8 |
| `entities/Chime.ts` | Ranged support def + instance, Charge | 8 |
| `entities/Slack.ts` | Enemy def + instance, motion archetypes, traits | 8 |
| `entities/Projectile.ts` | Pooled projectile (no def — patterns produce these) | 8 |
| `entities/Mainspring.ts` | The objective; Tension, shields, repair | 8 → 12 |
| `entities/Wave.ts` | Spawn groups, wave and boss-wave defs | 8 |
| `entities/Zone.ts` | Zone/stage defs, stage addressing | 8 |
| `entities/index.ts` | The single type-only barrel | 8 |
| `content/field.ts` | Ring geometry, Beat and conjunction constants | 8 |
| `content/damageTypes.ts` | Type interaction matrix | 8 |
| `content/budgets.ts` | Entity and frame budgets | 11 |
| `content/enemies.ts` | Slack roster (placeholder) | 31 |
| `content/zones.ts` | Progression map (placeholder) | 33 |
| `core/storage.ts` | StorageBackend abstraction, localStorage/memory backends | 9 |
| `core/saveSchema.ts` | Save shape, defaults, validation/repair, `resetRun` | 9 |
| `core/saveMigrations.ts` | Version migration chain | 9 |
| `core/save.ts` | SaveManager: load, corruption-safe write, export/import | 9 |
| `core/autosave.ts` | Autosave scheduling, coalescing, failure backoff | 9 |
| `utils/encoding.ts` | UTF-8-safe base64 | 9 |
| `utils/hash.ts` | FNV-1a checksum for export strings | 9 |
| `core/simulation.ts` | `SimulationState` — the complete mutable stage state | 8 |
| `core/stageLoader.ts` | Resolve, validate and initialize a stage | 8 |
| `core/rng.ts` | Seeded PRNG; the simulation never calls Math.random | 10 |
| `core/loop.ts` | Fixed-timestep tick in combat-spec §8 order; the Beat | 10 |
| `core/formation.ts` | Unit placement and cached formation bonuses | 10 |
| `core/bootstrap.ts` | Wires simulation, renderer, input and autosave; owns rAF | 10 |
| `core/fieldSync.ts` | Reconcile the live field with the save; refresh what stays | 43 |
| `core/render.ts` | Pixi scene reading simulation state | 7 → 10 |
| `systems/ai.ts` | Targeting policies, annular-arc range, Chime lead | 10 |
| `systems/spawn.ts` | Wave schedules, enemy motion, stat scaling | 10 |
| `systems/patterns.ts` | Bullet patterns as pure functions | 10 → 16 |
| `systems/collision.ts` | Projectile integration, block arc, hitboxes | 10 → 17 |
| `systems/combat.ts` | Damage formulas, death handling, drops | 10 |
| `systems/objectiveRules.ts` | Win/loss, wave advance, regen, shields, thresholds | 12 |
| `systems/feed.ts` | Transient combat events for the render layer | 17 |
| `systems/synergy.ts` | Conjunction detection, effects, preview | 10 |
| `utils/pool.ts` | Fixed-capacity object pool | 10 |
| `stores/game.svelte.ts` | The reactive projection — the only Svelte bridge | 10 |
| `utils/delta.ts` | Pooled gain/loss for the HUD's readouts | 42 |
| `content/keybindings.ts` | The ten actions and their default keys | 43 |
| `core/keybindings.ts` | Which action a stroke is; conflicts; repair | 43 |
| `content/palettes.ts` | Field palettes, including three colourblind-safe | 43 |
| `utils/format.ts` | `compact` — one abbreviation, everywhere | 42 |
| `ui/primitives/*.svelte` | Modal, Overlay, Button, Kbd, Meter, Stat, Delta, Tooltip | 42 |
| `ui/HUD.svelte` | Output, currencies, wave, Flare charge, diagnostics | 10 → 42 |
| `ui/Sidebar.svelte` | Click-through to every panel; stand down | 43 |
| `ui/MainMenu.svelte` | The menu, on Escape. Pauses while open | 43 |
| `ui/SettingsMenu.svelte` | Sound, legibility, keys, the save | 43 |

### Boundary enforcement

The three rules above are checked by `tests/boundaries.test.ts` rather than left
to review, because they are easy to break by reflex and expensive to unpick.
The test scans every module's import specifiers and fails if the simulation
layer reaches for Svelte or Pixi, if Pixi appears outside `render.ts`, if
`content/` reaches upward into `systems/` or `core/`, or if a second barrel
appears.

`tests/ui.test.ts` does the same job one layer up, for the rules in
`docs/design/ui-spec.md`: it fails if a screen styles a bare `button` or `kbd`,
hand-rolls a dialog, writes a numeric `z-index`, retypes a tokenised colour,
registers a window `keydown` handler, styles an interactive element with no
focus ring, or if a primitive reaches into `stores/`.

## Current state of `src/lib/core/render.ts`

Phase 7 leaves a **confirmation harness**, not the real renderer: it boots Pixi,
builds the ring containers, animates placeholder projectiles, and exposes frame
timings. It exists so ADR-001 rests on a measurement.

It also installs `window.__orreryHarness` under an `import.meta.env.DEV` guard, so
the render budget can be measured without `requestAnimationFrame` (which is
throttled in backgrounded and headless tabs). Phase 11 replaces this with a proper
profiling toggle. Phase 10 replaces the harness itself.
