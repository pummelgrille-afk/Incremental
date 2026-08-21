# Building an Incremental Auto-Battler: 50-Phase Repo Build Plan

**Stack:** Vite + TypeScript + Svelte 5 (already scaffolded in this repo)
**For:** Claude Code, working directly in this git repository

---

## Read this first — how Claude Code should treat this plan

The previous run of this plan collapsed into a single `index.html` with everything
inlined. That's not what this repo is for. Every phase below assumes:

- **No monolithic files.** One responsibility per file: one entity class per file,
  one system per file, one Svelte component per file. If a file is doing three
  jobs, split it.
- **Data-driven content.** Ally/enemy/wave/zone/upgrade definitions live as typed
  data in `src/lib/content/*.ts`, not hardcoded inside logic files.
- **Svelte 5 runes (`$state`, `$derived`, `$effect`) for reactive UI state.**
  Game-simulation state (the tick loop, entity positions, combat math) should
  live in plain TypeScript classes/modules outside the Svelte reactivity system,
  and the UI layer subscribes to a thin reactive projection of it — don't run
  the whole simulation through Svelte reactivity, it won't hold up at the
  entity counts this genre needs.
- **Commit at the end of every phase**, message format `Phase N: <short summary>`.
  Update the matching checklist file in `docs/phases/` as part of that commit.
- **Design docs are real files in the repo**, not scratch text in chat. Phases
  1–6 produce markdown in `docs/design/`, and later phases read from those files
  as the source of truth instead of re-deciding things ad hoc.

### Target repo structure

```
/
├── src/
│   ├── main.ts
│   ├── App.svelte
│   ├── lib/
│   │   ├── core/            # tick loop, engine bootstrap, RNG, save/load
│   │   ├── systems/         # combat.ts, ai.ts, spawn.ts, collision.ts,
│   │   │                    # synergy.ts, scaling.ts, offlineProgress.ts
│   │   ├── entities/        # Ally.ts, SupportUnit.ts, Enemy.ts,
│   │   │                    # Projectile.ts, Objective.ts
│   │   ├── progression/     # upgradeTree.ts, currencies.ts, prestige.ts,
│   │   │                    # achievements.ts
│   │   ├── content/         # allies.ts, supportUnits.ts, enemies.ts,
│   │   │                    # waves.ts, zones.ts, upgrades.ts, bosses.ts
│   │   ├── ui/               # HUD.svelte, UpgradeTree.svelte,
│   │   │                    # FormationEditor.svelte, MainMenu.svelte,
│   │   │                    # SettingsMenu.svelte, PrestigeModal.svelte
│   │   ├── stores/           # thin Svelte stores/runes projecting core state
│   │   └── utils/
│   ├── assets/                # sprites, audio, fonts
│   └── styles/
├── docs/
│   ├── design/                # Phase 1–6 output: pillars.md, market-research.md,
│   │                          # game-loop.md, narrative.md, combat-spec.md,
│   │                          # economy-spec.md
│   ├── phases/                 # one checklist file per phase, checked off as
│   │                          # Claude Code completes it
│   └── architecture.md
├── tests/                       # vitest unit tests, playwright e2e
├── public/
├── CLAUDE.md                     # project conventions (see below)
├── package.json / vite.config.ts / svelte.config.js / tsconfig.json
└── README.md
```

### Suggested `CLAUDE.md` (add this once, at repo root, if you don't have one)

```markdown
# Project conventions

- Vite + TypeScript + Svelte 5 (runes). No monolithic files — one class/system/
  component per file. See PLAN.md for the full repo layout.
- Simulation state lives in plain TS under src/lib/core and src/lib/systems.
  Svelte components read a reactive projection via src/lib/stores — they don't
  own simulation logic.
- Game content (allies, enemies, waves, zones, upgrades) is data in
  src/lib/content/*.ts, typed against interfaces in src/lib/entities.
- Design decisions live in docs/design/*.md and are the source of truth —
  update them when a design changes, don't let code and docs drift.
- One phase from PLAN.md = one focused commit, "Phase N: <summary>", with the
  matching docs/phases/phase-N.md checklist ticked off.
- Run `npm run check` (svelte-check) and `npm run test` before committing.
```

---

## Stage 0 — Concept & Design Foundation (Phases 1–6)

*Output for this stage is markdown in `docs/design/`, not code. Nothing in
`src/` should be touched yet beyond what's already scaffolded.*

### Phase 1: Define Core Pillars & an Original Theme
- Write `docs/design/pillars.md`: a one-page pitch built around the *mechanical*
  mix only — idle progression, auto-battle, bullet-hell dodging/positioning,
  deck-building, ranged support, permanent upgrades.
- In the same file, brainstorm 5–10 original settings unrelated to any
  body/virus framing (a lighthouse keeper warding off storm spirits, a
  beekeeper defending a hive, a spaceship crew fending off scavenger drones,
  a garden defending its roots from blight, a forge protecting its flame).
  Pick one and commit to it.
- List 3–5 design pillars independent of any reference title, plus target
  audience and platform (this repo targets browser/web given the Vite/Svelte
  stack — note that explicitly).

### Phase 2: Broad Competitive & Market Research
- `docs/design/market-research.md`: survey several games across incremental,
  auto-battler, and bullet-hell-survivor spaces — not one title, so no single
  game becomes a blueprint.
- Document the loop pattern that recurs across the genre: resource → permanent
  upgrade → stronger squad → deeper content → more resource.
- Note what your original setting can do differently.

### Phase 3: Core Game Loop Definition
- `docs/design/game-loop.md`: map the minute-to-minute loop (encounter starts →
  auto-combat → resource drops → spend on upgrades) and the session-to-session
  loop (run → prestige/reset → permanent upgrades → harder run).
- Define win/loss conditions per stage and the overall meta goal in your own
  theme's terms.
- Include a loop-flow diagram (mermaid, embedded in the md file, renders fine
  in GitHub).

### Phase 4: Build an Original Narrative & World
- `docs/design/narrative.md`: your own lore, characters, and tone — written
  from scratch, not adapted from any existing game's premise.
- Flavor text per zone/boss, achievement names fitting your world.
- Sanity check: would this stand on its own with no reference game in mind?

### Phase 5: Combat System Design Document
- `docs/design/combat-spec.md`: auto-battle rules (targeting logic, attack
  timing, formation grid), bullet-hell rules (projectile patterns, defended
  objective hitbox, dodge/block mechanics), ranged-support behavior distinct
  from front-line allies, damage formulas, elemental/type interactions.
- This file is what `src/lib/systems/combat.ts` and `src/lib/systems/ai.ts`
  will be implemented against in Stage 2.

### Phase 6: Economy & Progression Design Document
- `docs/design/economy-spec.md`: currencies (upgrade-tree resource, prestige
  resource, ally shards/tokens), upgrade-tree categories and rough tier
  counts, prestige/reset formula (what resets, what persists, how returns
  scale), a balancing table (drop rates, costs, time-to-unlock curves).
- Keep the balancing table as a markdown table or a `docs/design/balancing.csv`
  — either works, but it needs to be a real file Claude Code (and you) can
  reference and update, not something re-derived from memory each session.

---

## Stage 1 — Technical Foundation (Phases 7–11)

### Phase 7: Tooling Confirmation & Rendering Approach
- Stack is already decided: Vite + TypeScript + Svelte 5. This phase is about
  confirming the *rendering* approach for the simulation layer, since that's
  the piece Svelte doesn't own:
  - Decide between raw Canvas 2D (`<canvas>` + a render loop in
    `src/lib/core/render.ts`) vs. a lightweight rendering library (e.g.
    PixiJS) if you expect hundreds of on-screen projectiles/entities.
  - Given this genre's entity counts (bullet-hell + many allies), lean toward
    Canvas 2D with manual batching or PixiJS rather than rendering entities as
    individual Svelte/DOM nodes — DOM-per-bullet will not scale.
- Add dev dependencies as needed (`npm install`), confirm `vite.config.ts`
  handles them.
- Decide on persistence target: browser storage (`localStorage`/IndexedDB) is
  the default for a web build; note in `docs/architecture.md` if you intend to
  wrap this later (e.g. Tauri/Electron) for a storefront release, since that
  affects Phase 9 and Phase 47.

### Phase 8: Project Architecture Setup
- Create the folder skeleton under `src/lib/` shown above (`core/`, `systems/`,
  `entities/`, `progression/`, `content/`, `ui/`, `stores/`, `utils/`) with
  placeholder `index.ts` barrel files where useful.
- Define base TypeScript interfaces in `src/lib/entities/`: `Ally`,
  `SupportUnit`, `Enemy`, `Projectile`, `Objective`. Concrete content in
  `src/lib/content/` implements/extends these.
- Set up scene/stage-loading architecture: a `src/lib/core/stageLoader.ts` that
  reads a zone/stage definition from `content/zones.ts` and initializes the
  simulation — not per-stage Svelte routes.
- Establish naming/coding conventions in `CLAUDE.md` if not already there.

### Phase 9: Save & Persistence Architecture
- Design the save schema in `src/lib/core/save.ts` — TypeScript interface
  covering resources, upgrade-tree state, unlocked roster, achievements,
  settings. Version the schema (`schemaVersion: number`) from day one so
  future migrations don't break old saves.
- Implement autosave (interval + on key events), offline-time tracking
  (timestamp diff on load), and corruption-safe writes (write to a temp key,
  validate, then swap — or keep a last-known-good backup key).
- Use `localStorage` (or IndexedDB if save size warrants it) as the persistence
  backend; cloud-save is out of scope unless you're wrapping for a storefront
  (see Phase 7 note).

### Phase 10: Core Loop Prototype
- Build a bare-bones vertical slice: one `Ally`, one `Enemy` type, one
  projectile pattern, basic resource drop, wired end-to-end through
  `core/`, `systems/`, `entities/`, and a minimal `HUD.svelte` — using
  placeholder art in your own theme, not reference-game assets.
- This should live behind the app's default route/component so `npm run dev`
  shows it immediately.
- Validate frame pacing in-browser (Chrome/Firefox dev tools performance tab)
  on your target hardware.
- Answer early: does the auto-battle + bullet-hell mashup feel good with your
  own concept, at 60fps in a browser tab?

### Phase 11: Performance & Low-Spec Budget Plan
- Set entity-count and particle budgets appropriate for a browser target
  (document them in `docs/architecture.md`).
- Set up object pooling for projectiles/enemies/support units from day one —
  `src/lib/utils/pool.ts`, a generic object pool used by every system that
  spawns short-lived entities.
- Establish a lightweight profiling habit: browser Performance tab + a simple
  in-app FPS/entity-count counter toggle in dev builds.

---

## Stage 2 — Core Combat Systems (Phases 12–20)

*Everything in this stage is plain TypeScript under `src/lib/systems/` and
`src/lib/entities/`, driven by the specs in `docs/design/combat-spec.md`.
Svelte components in this stage should only render what the simulation
produces — they don't contain game logic.*

### Phase 12: Defended-Objective Base Entity
- `src/lib/entities/Objective.ts`: the central object your game revolves
  around, named per your Phase 1 theme (reactor, hive, hearth-flame, etc.).
- Loss condition (objective overwhelmed) and stage-clear condition in
  `src/lib/systems/combat.ts` or a dedicated `objectiveRules.ts`.
- Regeneration/shielding hooks if your design calls for it.

### Phase 13: Ally Auto-Battle AI
- `src/lib/systems/ai.ts`: targeting logic (nearest / lowest-HP /
  highest-threat), attack timing/cooldown per ally, formation grid with
  positional bonuses.

### Phase 14: Ranged Support-Unit System
- Separate, lightweight AI loop in `ai.ts` (or a split `supportAi.ts` if it
  diverges enough), distinct from front-line allies: long-range targeting,
  projectile spawning, cooldown/ammo design.
- Balance support-unit power against allies so both feel necessary — track
  this in `docs/design/balancing.csv`.

### Phase 15: Enemy AI & Spawn System
- `src/lib/systems/spawn.ts`: base enemy movement patterns (swarm, drift,
  charge) fitting your original threat concept, driven by wave-config data
  from `content/waves.ts` (type, count, timing).
- Enemy variety hooks (splitters, shielded, fast, tanky) reskinned to your
  theme in `content/enemies.ts`.

### Phase 16: Bullet-Hell Projectile & Pattern System
- `src/lib/systems/patterns.ts`: data-driven pattern definitions (spread,
  spiral, aimed, wall) consumed by `entities/Projectile.ts`.
- Pool projectiles via the Phase 11 object pool to support hundreds on-screen
  cheaply.
- Tune density/speed to match your intended tone — a deliberate choice, not a
  default.

### Phase 17: Collision & Damage Resolution
- `src/lib/systems/collision.ts`: hitbox/hurtbox decoupled from sprite bounds
  for fairness, spatial partitioning (grid or quadtree) to keep checks cheap
  at scale.
- Damage-number popups, hit-flash feedback, death/despawn effects surfaced to
  the render layer via the `stores/` projection.

### Phase 18: Synergy & Buff System
- `src/lib/systems/synergy.ts`: ally-to-ally synergy via formation adjacency
  or type pairing; buff/debuff stacking rules and duration.
- A synergy-preview affordance in `ui/FormationEditor.svelte` so players can
  plan layouts before committing.

### Phase 19: Wave & Difficulty Scaling Director
- `src/lib/systems/scaling.ts`: data-driven wave curve tied to the player's
  current power, boss-wave triggers at stage milestones.

### Phase 20: Combat Balancing & Telemetry Pass
- Add dev-only telemetry hooks (time-to-clear, deaths, DPS per ally) —
  gate behind an `import.meta.env.DEV` check so it's stripped from production
  builds.
- Run internal playtests focused purely on combat feel; iterate using the
  Phase 6 balancing table as ground truth.

---

## Stage 3 — Progression Systems (Phases 21–28)

*Lives in `src/lib/progression/`, backed by `content/upgrades.ts` and the
save schema from Phase 9. UI counterparts go in `ui/`.*

### Phase 21: Resource Collection & Currency System
- `progression/currencies.ts`: enemy/wave drops feeding the main currency,
  secondary currencies (ally tokens, prestige currency) with distinct
  sources.
- Currency UI (counters, gain animations) in `ui/HUD.svelte`.

### Phase 22: Upgrade Tree System (Backend)
- `progression/upgradeTree.ts`: node-graph structure with prerequisites,
  tiers, branches; unlock logic, cost scaling, respec rules if any; wired to
  the Phase 9 save schema.

### Phase 23: Upgrade Tree UI
- `ui/UpgradeTree.svelte`: pannable/zoomable tree view with
  locked/available/purchased node states, tooltips (in your world's voice,
  pulled from `content/upgrades.ts`), path-preview for planning spend.

### Phase 24: Ally/Deck Management System
- Ally inventory, unlock conditions, leveling in `progression/`; drag-and-drop
  formation editor in `ui/FormationEditor.svelte`; persisted loadouts/presets
  via the save system.

### Phase 25: Support-Unit Roster & Upgrade System
- Support-unit inventory and upgrade paths, distinct in feel from front-line
  allies; balance cost against ally costs; integrate into
  `FormationEditor.svelte`.

### Phase 26: Prestige / Reset Loop
- `progression/prestige.ts`: the "go again but stronger" mechanic; define what
  carries over (upgrade tree, roster) vs. resets (run resources);
  `ui/PrestigeModal.svelte` with a clear before/after preview.

### Phase 27: Idle/Offline Progress Calculation
- `systems/offlineProgress.ts`: time-elapsed-since-last-session calculation
  (from the Phase 9 timestamp), capped/diminishing offline rewards, a
  "welcome back" summary component.

### Phase 28: Achievements System
- `progression/achievements.ts`: your own achievement list and triggers,
  sized to your content. No native platform achievement API on web — track
  locally in the save file, and only add store-specific hooks if/when you
  wrap for a storefront (see Phase 7/47 notes).

---

## Stage 4 — Content Production (Phases 29–36)

*This stage is almost entirely additions to `src/lib/content/*.ts` plus
matching assets under `src/assets/`. Avoid editing systems code here beyond
what a new content type genuinely requires.*

### Phase 29: Ally Roster — Wave 1
- 8–12 launch allies with distinct roles (tank, DPS, support, control),
  original to your world, defined in `content/allies.ts` against the `Ally`
  interface.
- Balance against the Phase 6 economy model.

### Phase 30: Support-Unit Roster — Wave 1
- 4–6 launch support units in `content/supportUnits.ts` with clearly
  different ranged behaviors; balance against the ally power curve.

### Phase 31: Enemy Roster & Bullet Patterns
- Tiered enemy roster (basic, elite, specialist) in `content/enemies.ts`,
  each with a unique pattern from `systems/patterns.ts`, hooked into the
  spawn director. Prioritize clear attack telegraphs.

### Phase 32: Boss Encounters
- 3–5 milestone bosses in `content/bosses.ts`, multi-phase attack patterns,
  unique rewards; playtest spike-vs-flow difficulty balance.

### Phase 33: Stage/Zone Structure
- `content/zones.ts`: a progression map themed to your setting; stage-select
  UI (`ui/StageSelect.svelte`) with unlock gating; populate each zone with
  its enemy subset and visual theme.

### Phase 34: Upgrade Tree Content Population
- Fill out the full node set across offense/defense/economy/utility branches
  in `content/upgrades.ts`; write node descriptions in your world's tone;
  balance node costs against the full prestige curve.

### Phase 35: Full-Game Balancing Pass
- End-to-end playthroughs across multiple prestige loops; adjust so no single
  ally/support-unit/node dominates; validate offline-progress values feel
  meaningful but not run-breaking.

### Phase 36: Tutorial & Onboarding
- Light-touch tutorial (`ui/Tutorial.svelte`) introducing formation, support
  units, and the upgrade tree in sequence; contextual tooltips/first-time
  popups rather than a forced tutorial; playtest with new users.

---

## Stage 5 — Art & Audio (Phases 37–41)

### Phase 37: Art Style Guide & Asset Pipeline
- Lock palette, resolution, and pixel-density standards suited to your
  theme's mood in `docs/design/art-style.md`.
- Set up the sprite/animation import pipeline: raw assets in `src/assets/`,
  loaded via a small `core/assetLoader.ts` (preload manifest, so Vite bundles
  them correctly).
- Define VFX rules so bullets stay readable against backgrounds.

### Phase 38: Character & Enemy Sprite Production
- Idle/attack/hit/death animation sets for allies, support units, and
  enemies — all original designs, referenced from `content/*.ts` by asset key.
- Maintain strong silhouettes for readability at speed.

### Phase 39: Environment & Zone Art
- Parallax backgrounds and tilesets per zone; keep backgrounds low-contrast
  so they don't compete with foreground bullet patterns; optimize (atlasing,
  compression) for web delivery — watch total bundle/asset size for load
  time, not just runtime perf.

### Phase 40: VFX Production
- Hit-flash, death, level-up, upgrade-unlock effects; full bullet/projectile
  VFX library matching the Phase 16 pattern system; keep particle counts
  within the Phase 11 budget.

### Phase 41: Sound Design & Music
- Music/SFX reflecting your world's tone; SFX for attacks, hits, pickups, UI,
  achievement pop-ups; adaptive mixing between idle and combat intensity
  (Web Audio API, or a thin wrapper if you bring in a library).

---

## Stage 6 — UI/UX & Accessibility (Phases 42–44)

### Phase 42: HUD & Core UI System
- `ui/HUD.svelte`: always-on objective health, resources, wave/stage
  indicator; shared UI primitives (buttons, panels, tooltips) as reusable
  Svelte components used across upgrade tree, deck, and shop screens; gain/
  loss animations for readability during fast combat.

### Phase 43: Menus, Settings & Accessibility
- `ui/MainMenu.svelte`, `ui/SettingsMenu.svelte` (audio/video/rebinding),
  pause flow; colorblind-safe palettes for bullet patterns, screen-shake
  toggle, text scaling; keyboard/controller support alongside mouse.

### Phase 44: Localization Pipeline
- Externalize all UI/content text starting with your primary language (a
  simple `src/lib/i18n/` module or a small library); build a pipeline to add
  languages post-launch based on your own audience data; QA text overflow/
  wrapping across languages.

---

## Stage 7 — QA & Optimization (Phases 45–47)

### Phase 45: Full QA Pass
- `tests/`: vitest unit tests for systems logic (combat math, upgrade tree,
  save/load, prestige), Playwright e2e for core flows (start run, spend
  currency, prestige, reload and confirm save integrity).
- Test edge cases (0 allies, full deck, etc.); regression-test after each
  content addition; track bugs in GitHub Issues.

### Phase 46: Performance Optimization
- Profile in-browser; hit stable frame-rate targets; optimize hot paths
  (projectile pooling, AI update batching, canvas draw-call reduction);
  stress-test worst case (max enemies + max projectiles + full deck).

### Phase 47: Deployment & Distribution
- Web-native default: production build (`npm run build`), deploy to static
  hosting (GitHub Pages, Netlify, Vercel, Cloudflare Pages — pick one and
  wire up CI). Set up a GitHub Actions workflow that builds and deploys on
  push to main.
- Only relevant if you're targeting a storefront (Steam, etc.): wrapping the
  Vite build in Tauri or Electron, and revisiting achievements/cloud-save as
  native SDK calls — flag this explicitly before starting, since it's a
  meaningfully different track from a pure web deploy.

---

## Stage 8 — Launch & Post-Launch (Phases 48–50)

### Phase 48: Beta / Playtest & Marketing Ramp
- Deploy a beta build to a preview URL (most static hosts give you this per-
  branch/PR for free) for balance and bug feedback.
- Ramp marketing around your own branding: trailer, dev updates, community/
  Discord setup.
- Fold beta feedback into a final pre-launch balance/content pass.

### Phase 49: Launch
- Release checklist: merge to main → CI deploy → verify production build →
  patch notes → community posts.
- Monitor launch-day errors (a lightweight error-tracking snippet, e.g.
  Sentry, is worth adding before this phase) and user feedback closely.
- Keep a rapid hotfix pipeline ready (fast CI, small PRs) for day-one issues.

### Phase 50: Post-Launch Support & Live Content
- Establish a cadence for balance patches based on player data and reviews.
- Plan post-launch content: new allies, support units, zones, achievements —
  all extending your original world, added the same way as Stage 4.
- Build a feedback loop (GitHub Issues/Discussions, lightweight analytics if
  you add them) to guide the next roadmap.

---

## On originality

The one thing worth protecting deliberately throughout this whole plan is
Phase 1 and Phase 4's output — your setting, characters, and world. The
systems (auto-battle, bullet-hell, skill trees, deck-building, idle
progression) are common genre building blocks used across dozens of games;
assembling them isn't copying. Reusing another game's specific premise,
character designs, biome names, or art direction is what would cross the
line, so keep checking new content against "is this actually mine?" as you
build out Stages 4–5.
