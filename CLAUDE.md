# CLAUDE.md

Project guidance for Claude Code working in this repository.

## Repository

- Remote: `origin` → https://github.com/pummelgrille-afk/Incremental.git
- Default branch: `main`

## Project conventions

Build plan: `PLAN.md` at the repo root defines 50 phases across 8 stages. It is
the roadmap; `docs/design/*.md` is the source of truth for decisions made along
the way.

- Vite + TypeScript + Svelte 5 (runes). **No monolithic files** — one class,
  one system, or one component per file. If a file is doing three jobs, split
  it. See `PLAN.md` for the full repo layout.
- Simulation state lives in plain TS under `src/lib/core` and
  `src/lib/systems`, outside Svelte reactivity — the entity counts this genre
  needs will not survive running the whole sim through runes. Svelte components
  read a thin reactive projection via `src/lib/stores`; they never own
  simulation logic.
- Game content (allies, enemies, waves, zones, upgrades) is typed data in
  `src/lib/content/*.ts`, declared against interfaces in `src/lib/entities`.
  Content is never hardcoded inside logic files.
- Design decisions live in `docs/design/*.md` and are the source of truth.
  Update them when a design changes — do not let code and docs drift.
- One phase = one focused commit, with the matching `docs/phases/phase-N.md`
  checklist ticked off in that same commit.
- Run `npm run check` and `npm test` before committing.

## Naming & coding conventions

Established in Phase 8. Applies to everything under `src/lib/`.

### Domain vocabulary

Code uses the game's own nouns, not generic ones. The mapping from PLAN.md's
generic terms:

| PLAN.md | This codebase | Is |
|---------|---------------|-----|
| Ally | `Movement` | Front-line automaton in a rotating ring slot |
| SupportUnit | `Chime` | Ranged support on a static rim mount |
| Enemy | `Slack` | Creature of the Unwinding |
| Objective | `Mainspring` | The defended centre; its health is Tension |
| Projectile | `Projectile` | Unchanged |

**The noun "Movement" always means the entity, never positional change.** For
motion use `motion`, `velocity`, `advance` or `position`. This collision is the
one real cost of the domain vocabulary; keep it contained.

### Definitions vs. instances

Every entity type splits in two, and the distinction is load-bearing:

- **`XDef`** — immutable content data, authored in `src/lib/content/*.ts`,
  referenced by stable string `id`. Save files store ids, never objects.
- **`XInstance`** — mutable runtime state, created by the loader or a spawner,
  holding a `readonly def` back-reference plus live fields.

Content authors touch only `Def`s. Systems mutate only `Instance`s.

### Files and exports

- One entity, one system, or one component per file. Filename matches the
  primary export: `Movement.ts` exports `MovementDef`/`MovementInstance`;
  `stageLoader.ts` exports `loadStage`.
- Entity files are `PascalCase`; system, content and utility files are
  `camelCase`.
- **One barrel only** — `src/lib/entities/index.ts`, which is type-only. Entity
  types are imported nearly everywhere, so it earns its place. Elsewhere barrels
  invite import cycles and defeat tree-shaking, so import modules directly.
- Prefer `import type` for types so nothing type-only reaches the bundle.

### Units

- **Time is seconds** everywhere in the simulation. The two exceptions are named
  for it (`evalInterval` in ms, `telegraphMs`) — otherwise assume seconds.
- **Angles are radians.** Degrees appear only in design docs and UI copy.
- **Distances are pixels** at the design resolution, converted at render time.
- Damage is a float in the simulation and rounded only for display. Rounding in
  the simulation compounds badly across thousands of small hits.

### Where things must not go

- Nothing under `core/`, `systems/`, `entities/` or `content/` imports Svelte or
  Pixi. Those modules must run in a plain Vitest process with no DOM.
- `stores/` is the only bridge into Svelte.
- `render.ts` reads simulation state and never writes it.
- Tuning numbers live in `content/`, mirroring `docs/design/balancing.csv`.
  Systems read them; they never hardcode a constant the CSV owns.

## Git workflow rules

### Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/). Every commit
message must start with one of these types:

| Type        | Use for                                                        |
|-------------|----------------------------------------------------------------|
| `feat:`     | A new feature or user-facing capability                         |
| `fix:`      | A bug fix                                                       |
| `docs:`     | Documentation only (README, comments, this file)                |
| `refactor:` | Code change that neither fixes a bug nor adds a feature         |
| `chore:`    | Tooling, config, dependencies, build scripts, housekeeping      |

Format:

```
<type>: <short imperative summary, lowercase, no trailing period>

<optional body explaining what and why, wrapped at ~72 chars>
```

Examples:

```
feat: add prestige multiplier to resource tick
fix: prevent negative balance when buying max upgrades
docs: document the save-file format
chore: add .gitignore for node build output
```

An optional scope is fine when it clarifies things: `feat(ui): ...`.

### Phase commits

`PLAN.md` asks for `Phase N: <summary>`; the table above asks for a Conventional
Commits type. Both apply — put the phase in the summary line after the type:

```
docs: phase 3 — define the core game loop
feat: phase 16 — add data-driven bullet pattern system
```

Design phases (1–6) are usually `docs:`; system and content phases are `feat:`.

### Pushing

**Always ask for explicit confirmation before running `git push`.** Never push
automatically, never as part of a larger batch of commands, and never because a
task "seems finished". Show what is about to be pushed — branch, target remote,
and the commits involved — then wait for a clear yes.

Committing locally does not require this confirmation; pushing does.

### Secrets — never commit

Do not commit, stage, or write into tracked files any of the following:

- `.env` files of any kind (`.env`, `.env.local`, `.env.production`, ...)
- API keys, access tokens, client secrets, session cookies
- Private keys and certificates (`*.pem`, `*.key`, `*.pfx`, `id_rsa`)
- Cloud credential files (`.aws/credentials`, service-account JSON)
- Database connection strings containing passwords

Before every commit:

1. Confirm a `.gitignore` exists and covers common secret and build files.
   If it is missing, create one before committing.
2. Review the staged diff (`git diff --cached`) for anything that looks like a
   credential, even inside example or test files.
3. If a secret is spotted, stop and tell the user rather than committing.

Use a committed `.env.example` with placeholder values to document required
environment variables — never the real `.env`.

If a secret was already committed, treat it as compromised: tell the user to
rotate it, and do not assume that removing it in a later commit is sufficient,
since it remains in git history.
