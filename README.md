# Incremental

An incremental/idle game built with Svelte 5, TypeScript and Vite.

## Getting started

```bash
npm install
npm run dev
```

## Scripts

| Command            | Does                                          |
|--------------------|-----------------------------------------------|
| `npm run dev`      | Dev server with hot module replacement        |
| `npm run build`    | Production build into `dist/`                 |
| `npm run preview`  | Serve the production build locally            |
| `npm run check`    | Type-check `.ts` and `.svelte` files          |
| `npm test`         | Run the test suite once                       |
| `npm run test:watch` | Re-run tests on change                      |

## Layout

```
src/
  game/                 framework-agnostic simulation
    state.svelte.ts     reactive state, generator definitions, tick
    loop.ts             fixed-timestep game loop + autosave
    save.ts             localStorage persistence, offline progress
    format.ts           big-number and duration formatting
  lib/
    Generator.svelte    one purchasable generator row
  App.svelte            shell and layout
  main.ts               entry point
```

The simulation in `src/game/` has no Svelte component dependencies, so the rules
can be unit-tested and the UI swapped without touching game logic.

## Design notes

**Fixed timestep.** `loop.ts` accumulates real elapsed time and steps the
simulation in fixed 50 ms slices, so progression is identical on a 60 Hz and a
144 Hz display. Catch-up is clamped to 5 seconds so a backgrounded tab resumes
smoothly rather than fast-forwarding.

**Fine-grained reactivity.** State uses Svelte 5 runes (`$state`, `$derived`).
A ticking counter updates the one text node that reads it — there is no
component re-render and no virtual DOM diff on the hot path.

**Numbers.** Plain JS `number` reaches ~1.8e308, which covers a long
progression. If the game ever needs to exceed that, swap `format.ts` and the
arithmetic in `state.svelte.ts` for `break_infinity.js`.
