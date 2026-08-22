# Progress

State of the build, kept short enough to stay true. `PLAN.md` is the roadmap,
`docs/design/*.md` is the source of truth for decisions, and
`docs/phases/phase-N.md` is what each phase actually did. This file is the map
between them.

**Where we are:** Phases 1–42 done. Stages 1–5 complete; Stage 6 (UI/UX &
Accessibility) is under way — Phase 43 (menus, settings, accessibility) is next.

**Health:** 999 tests across 43 files, `npm run check` clean, production build
890 KB with every sprite inlined.

---

## What was just built — Phase 42, HUD & core UI

The shared UI layer the eight existing screens should always have been built on,
plus the gain/loss readouts PLAN.md asks for at this phase.

| Built | Key files |
|-------|-----------|
| Eight primitives — Modal, Overlay, Button, Kbd, Meter, Stat, Delta, Tooltip | `src/lib/ui/primitives/` |
| Design tokens: palette, radius, and a **named** stacking order | `src/styles/app.css` |
| Pooled gain/loss, framework-free and tested | `src/lib/utils/delta.ts` |
| One number format, truncating, everywhere | `src/lib/utils/format.ts` |
| The rules, enforced rather than reviewed | `tests/ui.test.ts`, `docs/design/ui-spec.md` |

It was a deduplication, and the count is the argument for having done it: three
hand-rolled scrims at three different alphas, five copies of the button rules,
four of the keycap rules, `z-index` chosen one at a time in six files, and one
red meaning both "the Sun is dying" and "this control is disabled".

Three things it found on the way, all of the same kind as the ones Stage 5
turned up:

- **No dialog ever focused itself.** All three set `tabindex="-1"` and none
  called `focus()`; a tab press from an open modal walked the HUD behind the
  scrim. The fifth authored-but-never-connected thing this project has found.
- **The hover card clamped against a guess at its own height** — 250px against a
  real 310–330. It measures itself now.
- **The same balance printed two ways**, `11.83K` in the HUD and `11833` in the
  Formation header.

And one thing genuinely new on screen: **Output now says when it is being hit.**
It had a bar easing over 120 ms and nothing else, so at a full formation it
could lose a fifth of its width between two glances without ever being seen to
move.

---

## The stage before — Stage 5, Art & Audio (Phases 37–41)

| Phase | Built | Key files |
|-------|-------|-----------|
| 37 | Art style guide, sprite pipeline, `assetKey` made live | `docs/design/art-style.md`, `src/lib/core/assetLoader.ts`, `tools/normalise-sprites.py` |
| 38 | Animation system; death clips derived from the supplied art | `src/lib/core/animation.ts`, `tools/derive-clips.py` |
| 39 | Generated starfield per zone, rotational parallax | `src/lib/content/backdrop.ts`, `src/lib/core/backdrop.ts` |
| 40 | Particle VFX, including the conjunction burst | `src/lib/systems/particles.ts`, `src/lib/content/effects.ts` |
| 41 | Synthesised sound and a generative score | `src/lib/content/audio.ts`, `src/lib/content/music.ts`, `src/lib/core/audio.ts`, `src/lib/core/audioMix.ts`, `src/lib/core/music.ts` |

Three things in that stage were fixes to problems nobody had noticed:

- **The conjunction had no visual for twenty-two phases.** `ConjunctionEvent
  .angle` was documented as "where the render layer draws the burst" since Phase
  18 and nothing drew it.
- **`PLATFORM_COLOURS` had been dead for eight phases**, keyed on Platform ids
  the Phase 29 reskin renamed. Every lookup missed; all ten drew the same colour.
- **The music was inaudible**, and then the cues were inaudible under the music.
  Both only visible once an `AnalyserNode` made the output measurable.

---

## Decisions worth not re-litigating

**Generated beats authored, where a rule can do the job.** The starfield, the
particles and the entire soundtrack are rules rather than files. They cost no
bytes, they are exact at any scale, and — the part that mattered most — their
constraints can be *asserted* instead of eyeballed. See `art-style.md` §8.

**An effect's cost is its frequency, not its size.** Learned three times, each
more expensive than the last:

- Particles: a burst per conjunction cost 881/second against a budget of 400.
  Now one per evaluation. `art-style.md` §6 rule 8.
- Audio: a Platform firing has no sound at all, because 48 of them once a second
  is an unlistenable buzz.
- The conjunction bell was removed entirely — a 1.6s tail against alignments
  arriving 36 times a second.

**A number the player must react to gets a float; one they merely need to know
does not.** The same rule as the two above, applied to the DOM: Output and
Salvage carry pooled deltas, Clearance and Recollection are drawn quiet. The
pooling is arithmetic in `utils/delta.ts` rather than a rune, so it can be
asserted. `ui-spec.md` §4.

**Light does not accumulate; sound does.** Which is why the conjunction kept its
particle burst and lost its bell at the same frequency.

**Presentation never touches the simulation's random source.** The particle
field carries its own `Rng`. Drawing scatter from the simulation's stream would
put every wave downstream of how many sparks an explosion threw, and destroy
Phase 35's reproducibility.

**The output layer is exactly two files** — `core/render.ts` (Pixi) and
`core/audio.ts` (Web Audio). Everything *decidable* lives beside them in modules
that import nothing: `core/animation.ts`, `core/backdrop.ts`, `core/audioMix.ts`,
`core/music.ts`. The test for membership is narrow: does it need the API to
answer the question? See `docs/architecture.md` §Layer boundaries.

**Tune by measuring the end of the chain.** Both audio failures and the first
starfield were correct by argument and wrong in fact. A constraint rule can only
tell you when something is too loud.

---

## Open TODOs

### Blocking a real release

- [ ] **The prestige curve does not compound.** Phase 35's headline finding, and
      still unresolved: twelve prestige loops plateau at stage 11 and never move,
      while the cadence table wants 8 / 14 / 22 / 40 / 75. Fully invested the
      player is ×107 their opening damage against ×273 total wave HP at stage 40.
      It is structural, not a tuning miss — no constant inside its authored band
      fixes it. Needs a prestige reward that **compounds** rather than adding
      percentages: a change to `economy-spec.md` §2 and §7, and a design decision
      rather than a balancing pass's call. Pinned by tests in
      `tests/balance.test.ts` that fail if the gap closes or widens.
      → `docs/phases/phase-35.md`

- [ ] **Four accessibility settings are dead configuration.** `screenShake`,
      `reducedMotion`, `colourblindPalette` and `textScale` have been in
      `src/lib/core/saveSchema.ts` since Phase 8 and are read by **nothing**.
      Confirmed by grep, not by memory. Phase 43 owns them. This is the same
      pattern already caught five times — `assetKey`, `PLATFORM_COLOURS`, the
      volume settings, nearly the conjunction chord table, and Phase 42's
      dialogs that never took focus. `reducedMotion` now has something concrete
      to switch off: `Delta`'s floats and `Meter`'s struck flash are the first
      animations in the chrome.

- [ ] **Dialogs do not trap focus, or give it back.** Phase 42 moves focus
      *into* a modal when it opens, which is the half that was free. A trap
      while it is open, and restoring focus to the control that opened it, are
      Phase 43's. → `docs/design/ui-spec.md` §5

- [ ] **No settings UI at all.** The three volume faders work and have no
      control surface. Phase 43.

### Content and art

- [ ] **Drawn animation frames.** `idle`, `attack` and `hit` are one frame each.
      The system, the naming convention and the pipeline are done — dropping
      `bolt-attack-1.png` into `src/assets/sprites/raw/` and re-running the
      normaliser is the whole remaining step. Brief in `art-style.md` §7;
      priority order in `docs/phases/phase-38.md`.
- [ ] **Per-unit art.** Ten Contacts share three sprites (by tier), ten Platforms
      share four (by damage type). Interim and better than the identical circles
      it replaced, but Phase 38's real goal. Tests pin the categories apart so
      detail cannot be gained by losing the read.
- [ ] **Arrays have no art and no `assetKey`.**

### Known gaps in the simulation

- [ ] **Arrays never take damage.** `hp` and `disabledFor` exist on
      `ArrayInstance`, but nothing anywhere sets `disabledFor` above zero: the
      only writes are the initialiser in `src/lib/core/formation.ts` and the
      recovery reset at `src/lib/systems/ai.ts:277`, which can therefore never
      run. A rim mount is invulnerable, and `hit` and `death` clips for Arrays
      would be dead content whatever art arrived. Either they become damageable
      or the fields go.

### Verification we cannot do here

- [ ] **Playtest onboarding with new users.** Phase 36's open checklist item.
      The card pacing is traced through a real run by test; whether the copy
      lands, and whether nine cards is two too many, needs people.
- [ ] **Judge the audio by ear over a long session.** Levels are measured now,
      which rules out the two failures that already happened, but a correct level
      is not a pleasant sound. Most likely first moves: `LAYER_GAIN` (three
      numbers), `PROGRESSION` (eight chords), `CUES.hit.minInterval`.

### Watch, don't act yet

- **Asset payload tripwire at 120 KB.** `tests/assets.test.ts` fails when the
  sprite payload passes it. Currently 26 sprites, ~40 KB, all inlined by Vite as
  data URIs. Atlasing is due when that fires and not before — an atlas built for
  art that does not exist is a guess.
- **Particle budget headroom.** Peak 167–188 of 400 across the whole ladder with
  a maximum formation. Half the budget is spare for later effects.

---

## Where things live

```
PLAN.md                      50 phases across 8 stages — the roadmap
CLAUDE.md                    conventions: naming, layering, git rules
docs/architecture.md         ADRs, layer boundaries, performance budgets
docs/design/*.md             source of truth for decisions
docs/phases/phase-N.md       what each phase actually did, and what it found
tools/*.py                   asset preparation, run by hand, never at build time

src/lib/content/             typed data: units, waves, zones, upgrades,
                             effects, audio, music, backdrops
src/lib/entities/            Def / Instance type pairs, one per entity
src/lib/systems/             combat, ai, spawn, collision, synergy, particles
src/lib/progression/         currencies, roster, prestige, tree, tutorial
src/lib/core/                loop, save, stageLoader, render, audio, and the
                             framework-free decision modules beside them
src/lib/stores/              the only bridge into Svelte
src/lib/ui/                  Svelte components; they decide nothing
src/lib/ui/primitives/       the shared set those are built from
tests/                       43 files; support/playthrough.ts drives whole runs
```

Three boundaries that must not erode, all in `docs/architecture.md`:

1. Nothing under `core/`, `systems/`, `entities/` or `content/` imports Svelte,
   Pixi or a browser API — except the two output files named above.
2. `render.ts` reads simulation state and never writes it.
3. Nothing under `ui/primitives/` imports `stores/`. A primitive that reads the
   game is a screen with fewer props.

---

## Running it

```bash
npm run dev          # http://localhost:5173 — note: localhost, not 127.0.0.1
npm test             # 999 tests
npm run check        # svelte-check + tsc
npm run build
```

Audio needs one click on the field before the browser will start it — that is
the browser's rule, not a bug. `H` opens the Manual.

The dev server binds to IPv6 localhost only, so `http://127.0.0.1:5173` will
*not* connect, and would be a different `localStorage` origin — a different save
— if it did.
