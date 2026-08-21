# Architecture

> Started in Phase 7. Phase 8 adds the module skeleton and interfaces; Phase 11
> adds performance budgets. Design decisions live in `docs/design/`; this file
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
serialized size is **5–20 kB** — small.

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
└──────────────────────────────────────────────────────────┘
```

**Three rules that must not erode:**

1. Nothing under `core/`, `systems/`, `entities/` or `content/` imports Svelte
   *or* Pixi. Those modules must stay runnable in a plain Vitest process with no
   DOM — that is what makes combat math and prestige logic testable in Phase 45.
2. `stores/` is the only bridge into Svelte, written once per tick at step 11 of
   the order in `combat-spec.md` §8.
3. `render.ts` **reads** simulation state and never writes it. Rendering is a pure
   projection; a dropped frame must never change the simulation.

The renderer and the simulation therefore run at different rates by design — a
fixed-timestep simulation with rendering interpolating between states. Phase 10
establishes the pacing.

## Current state of `src/lib/core/render.ts`

Phase 7 leaves a **confirmation harness**, not the real renderer: it boots Pixi,
builds the ring containers, animates placeholder projectiles, and exposes frame
timings. It exists so ADR-001 rests on a measurement.

It also installs `window.__orreryHarness` under an `import.meta.env.DEV` guard, so
the render budget can be measured without `requestAnimationFrame` (which is
throttled in backgrounded and headless tabs). Phase 11 replaces this with a proper
profiling toggle. Phase 10 replaces the harness itself.
