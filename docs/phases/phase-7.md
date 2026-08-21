# Phase 7: Tooling Confirmation & Rendering Approach

**Stage 1 — Technical Foundation**
Output: `docs/architecture.md` (ADR-001, ADR-002), `src/lib/core/render.ts`

## Checklist

- [x] Confirm the rendering approach for the simulation layer
      — **PixiJS 8 (WebGL)**, recorded as ADR-001
- [x] Weigh raw Canvas 2D against a lightweight rendering library
- [x] Verify the choice holds at this genre's entity counts rather than
      asserting it — harness built and measured in-browser
- [x] Add dev dependencies as needed (`npm install pixi.js` → 8.20.0)
- [x] Confirm `vite.config.ts` handles them — no config change required
- [x] Decide the persistence target — **localStorage**, recorded as ADR-002
- [x] Note the Tauri/Electron question in `docs/architecture.md`, since it
      affects Phase 9 and Phase 47 — **web-only, out of scope**

## Decisions locked

- **PixiJS 8 over Canvas 2D.** Rotation is the core mechanic and the expensive
  case in Canvas 2D; a container per ring makes it O(rings) instead of O(units).
  The art direction needs glow, and Phase 40 needs particles.
- **Bundle cost accepted and measured:** 9.7 kB → **157.2 kB gzipped**
  (530 kB raw); Pixi's share is ~148 kB. Phase 39 must count Pixi when watching
  total asset size.
- **localStorage over IndexedDB.** Saves are 5–20 kB; IndexedDB solves a problem
  this game does not have.
- **Web-only.** No native filesystem (Phase 9), no platform achievement API
  (Phase 28), static hosting via GitHub Actions (Phase 47).

## Measured evidence

Chrome, NVIDIA RTX 3060 (ANGLE/D3D11), 1280×720. `step() + render() +
gl.finish()`, 200 samples per tier after warm-up.

| Projectiles | Median | p95 | % of frame |
|-------------|--------|-----|------------|
| 200 | 0.20 ms | 0.50 ms | 1.2% |
| 600 (budget) | 0.30 ms | 0.50 ms | 1.8% |
| 1200 (budget max) | 0.50 ms | 0.80 ms | 3.0% |
| 2400 (2× over) | 1.80 ms | 3.00 ms | 10.8% |

Container-per-ring verified: one write to `ringContainer.rotation` moved a unit's
global position while its local coordinates stayed untouched. Six units moved from
one write.

**Caveat carried to Phases 11 and 46:** an RTX 3060 is not a low-spec target.
These numbers show the approach is sound, not that the budget is safe on
integrated graphics. Re-measure on weaker hardware before treating the
`balancing.csv` projectile budget as final.

## Consequences for later phases

| Phase | Carried forward |
|-------|-----------------|
| 9 | Versioned schema, write-validate-swap, **export/import save string** (localStorage is wiped by "clear browsing data") |
| 10 | Replaces the harness with the vertical slice; establishes fixed-timestep pacing |
| 11 | Replaces the dev window hook with a real profiling toggle; sets budgets |
| 27 | Offline progress reads the save timestamp |
| 39 | Pixi counts toward total bundle size |
| 46 | WebGL context-loss handling; stress-test on low-spec hardware |

## Notes

`render.ts` currently holds a confirmation harness, not the real renderer. It is
deliberately throwaway — its purpose was to make ADR-001 a measurement rather than
a judgment call. The `window.__orreryHarness` hook is `import.meta.env.DEV`-guarded
and stripped from production builds.
