# Progress

State of the build, kept short enough to stay true. `PLAN.md` is the roadmap,
`docs/design/*.md` is the source of truth for decisions, and
`docs/phases/phase-N.md` is what each phase actually did. This file is the map
between them.

**Where we are:** Phases 1–43 done. Stages 1–5 complete; Stage 6 (UI/UX &
Accessibility) is under way — Phase 44 (localization) is next.

**Health:** 1046 tests across 45 files, `npm run check` clean, production build
890 KB with every sprite inlined. Save schema 8.

---

## What was just built — Phase 43, menus, settings, accessibility

The settings screen, the menu, the pause, and the four accessibility settings
that had been dead configuration since Phase 8.

| Built | Key files |
|-------|-----------|
| Settings: sound, legibility, keys, the save | `src/lib/ui/SettingsMenu.svelte` |
| The menu, on Escape. Pauses while open | `src/lib/ui/MainMenu.svelte` |
| Rebindable keys, stored by physical position | `src/lib/content/keybindings.ts`, `src/lib/core/keybindings.ts` |
| Three colourblind-safe field palettes, measured | `src/lib/content/palettes.ts`, `tests/palettes.test.ts` |
| Four more primitives: Field, Toggle, Slider, Choice | `src/lib/ui/primitives/` |

**The four dead settings are alive.** `screenShake`, `reducedMotion`,
`colourblindPalette` and `textScale` were unreachable rather than forgotten —
there was no screen to put them on, so every phase that could have connected one
had no surface to connect it to. Text scale cost a single line, because every
size in this project was already in `rem`.

Two bugs in Phase 42's `Modal`, invisible until there were two dialogs to stack
and found by driving the app rather than by reading it:

- **One Escape closed two screens**, because every open Modal listened on the
  window.
- **Escape reopened the menu it had just closed**, because the router ran in the
  bubble phase and arrived after the dialog had already closed itself.

Both are one decision now: Escape is a binding like any other, the router owns
it, and it listens in the capture phase. No component may register a window
`keydown` handler; the test enforces it.

The palette test also found something about the *shipped* palette: percussive
gold against thermal orange is the tightest pair in the game at 88, under the
floor the accessibility palettes are held to. Recorded rather than fixed —
widening it is an art decision, not a threshold's call.

---

## What came before — Phase 42, HUD & core UI

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

### Deferred deliberately

- [ ] **No controller support.** PLAN.md Phase 43 asks for
      "keyboard/controller"; the keyboard half is done and the Gamepad API is
      not started. Deferred deliberately: there is no controller in this
      environment, and an implementation that has never had a gamepad attached
      is a guess with a changelog entry.

### Verification we cannot do here

- [ ] **Playtest onboarding with new users.** Phase 36's open checklist item.
      The card pacing is traced through a real run by test; whether the copy
      lands, and whether nine cards is two too many, needs people.
- [ ] **Judge the colourblind palettes by eye.** They are measured against a
      simulation of each deficiency, which rules out the collapse they exist to
      prevent. A palette that clears a distance threshold is still not the same
      as one that looks right on a moving field.

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
tests/                       45 files; support/playthrough.ts drives whole runs
```

Four boundaries that must not erode, all in `docs/architecture.md`:

1. Nothing under `core/`, `systems/`, `entities/` or `content/` imports Svelte,
   Pixi or a browser API — except the two output files named above.
2. `render.ts` reads simulation state and never writes it.
3. Nothing under `ui/primitives/` imports `stores/`. A primitive that reads the
   game is a screen with fewer props.
4. No component registers a window `keydown` handler. `bootstrap.ts` routes
   every key, including Escape, because it is the only place that knows what is
   open. See `docs/design/ui-spec.md` §7.

---

## Running it

```bash
npm run dev          # http://localhost:5173 — note: localhost, not 127.0.0.1
npm test             # 1046 tests
npm run check        # svelte-check + tsc
npm run build
```

Audio needs one click on the field before the browser will start it — that is
the browser's rule, not a bug. `H` opens the Manual, `Esc` the menu, and every key is rebindable.

The dev server binds to IPv6 localhost only, so `http://127.0.0.1:5173` will
*not* connect, and would be a different `localStorage` origin — a different save
— if it did.
