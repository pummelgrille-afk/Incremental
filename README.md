# The Orrery

An incremental auto-battler set in a clockwork machine that drives the heavens.
You never control a character and never fire a shot — you arrange wound automata
on concentric rings that turn, and nudge those rings to slide your line clear of
incoming fire.

Built with Svelte 5, TypeScript and Vite. Browser target.

> **Status: Stage 0 complete (Phases 1–6).** The design foundation is written.
> Code begins at Phase 7. See `PLAN.md` for the 50-phase roadmap.

## Getting started

```bash
npm install
npm run dev
```

## Scripts

| Command              | Does                                   |
|----------------------|----------------------------------------|
| `npm run dev`        | Dev server with hot module replacement |
| `npm run build`      | Production build into `dist/`          |
| `npm run preview`    | Serve the production build locally     |
| `npm run check`      | Type-check `.ts` and `.svelte` files   |
| `npm test`           | Run the test suite once                |
| `npm run test:watch` | Re-run tests on change                 |

## Design documents

`docs/design/` is the source of truth. Code is implemented against these, and they
are updated when a design changes rather than left to drift.

| Document | Covers |
|----------|--------|
| [pillars.md](docs/design/pillars.md) | Pitch, setting selection, the five design pillars, audience |
| [market-research.md](docs/design/market-research.md) | Genre survey, the shared loop, differentiators, risks |
| [game-loop.md](docs/design/game-loop.md) | Minute-to-minute and session-to-session loops, win/loss |
| [narrative.md](docs/design/narrative.md) | Lore, tone, zones, bosses, achievements |
| [combat-spec.md](docs/design/combat-spec.md) | Targeting, rotation, conjunction, patterns, damage |
| [economy-spec.md](docs/design/economy-spec.md) | Currencies, upgrade tree, prestige, offline, scaling |
| [balancing.csv](docs/design/balancing.csv) | 77 tuning parameters — numeric ground truth |

Phase checklists live in `docs/phases/`, ticked off as each phase completes.

## The core idea

Three concentric rings turn at deliberately non-integer ratios around a central
**Mainspring**. You slot **Movements** into ring positions and mount **Chimes** on
the static rim. The rings rotate, so a formation is a pattern *over time* rather
than a layout.

When units on different rings align within a few degrees — a **conjunction** — the
alignment fires. Because the ring periods never repeat cleanly, conjunctions arrive
on their own schedule: you arrange for them in advance, then watch them pay off.

Your only live input during combat is a **ring nudge** — one slot-width of rotation,
on a short cooldown. It slides an entire arc of defenders out of an incoming
pattern. That is the whole dodging layer, and it is coarse on purpose.

## Repo layout

```
src/lib/
  core/         tick loop, engine bootstrap, RNG, save/load
  systems/      combat, ai, spawn, collision, synergy, scaling, offlineProgress
  entities/     Movement, Chime, Slack, Projectile, Mainspring
  progression/  upgradeTree, currencies, prestige, achievements
  content/      typed data: allies, enemies, waves, zones, upgrades, bosses
  ui/           Svelte components
  stores/       thin reactive projection of simulation state
  utils/
```

Simulation state lives in plain TypeScript under `core/` and `systems/`, outside
Svelte reactivity — the entity counts this genre needs would not survive running
the whole simulation through runes. Components read a projection via `stores/` and
never own simulation logic. See [CLAUDE.md](CLAUDE.md).
