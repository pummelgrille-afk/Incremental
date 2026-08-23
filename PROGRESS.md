# Progress

State of the build, kept short enough to stay true. `PLAN.md` is the roadmap,
`docs/design/*.md` is the source of truth for decisions, and
`docs/phases/phase-N.md` is what each phase actually did. This file is the map
between them.

**Where we are:** Phases 1–44 done. Stages 1–6 complete — Stage 6 closed with
the localization pipeline. Phase 45 (full QA pass) opens Stage 7.

**Health:** 1098 tests across 47 files, `npm run check` clean, production build
904 KB with every sprite inlined. Save schema 8.

---

## What was just built — Phase 44, the localization pipeline

542 strings, none of which could be changed without editing a component.

| Built | Key files |
|-------|-----------|
| The catalogue and the translator, framework-free | `src/lib/i18n/` |
| The one rune a language change hangs on | `src/lib/stores/i18n.svelte.ts` |
| A sentence with a keycap inside it | `src/lib/ui/T.svelte` |
| A translator's stub, written through Vite | `tools/i18n-extract.mjs` |
| 28 checks, including two that measure a screen | `tests/i18n.test.ts` |

**Text lives in two halves, and content English did not move.** Chrome — 264
labels, banners and hints — is now `i18n/en/*.ts`, keyed and compiler-checked.
The 278 names and descriptions in `content/` stayed where they were authored,
beside the tuning, and a translation *overrides* them by a key derived from the
id. Hoisting them would have turned every content file into a list of ids.
Both halves fall back per key, so a half-finished translation is a
half-translated game rather than a broken one.

**The QA language is a rule, not a table.** There is only one language, so the
one this phase QAs against is generated: `qa` is a `transform` applied to the
English source at lookup time, expanding hardest on the shortest strings and
wrapping every message in `⟦…⟧` so a clipped string reads as a missing bracket.
It therefore covers all 542 strings, `content/` included, and cannot fall out of
step with any of them. Same argument as the starfield and the score.

Running the game in it found four things:

- **The palette row went through the side of its dialog.** `Choice` was four
  nowrap options in a fixed-width modal — it fit English and nothing else. It
  wraps now, which is the fix; a budget would only have said how close we were.
- **Three sidebar tabs were quietly renamed** by reaching for the panel titles:
  "Almanac" became "The Almanac" on the six labels with the least room in the
  game.
- **Five keycaps were still hardcoded letters** — `T`, `F`, two `R`s and an
  `Esc` — the thing Phase 43 fixed in the HUD and missed in the panels.
- **`App.svelte` held the string with the worst ratio of importance to
  visibility**: the sentence shown when the game refuses to start, in a file the
  `ui/` sweep did not cover.

**The locale is an argument, not a read for effect.** The first version had
`void state.code` at the top of `t()`; it works, and it reads as dead code that
somebody deletes, after which the game is fine until a player changes language.
Every function in `translate.ts` comes in a pair now — `translateIn(locale, …)`
for components, and a bare form for `core/save.ts`, which builds an `Error` and
has nothing to be reactive to.

**A refusal carries a key, not a sentence.** `SaveImportError` takes a
`MessageKey`; `TRACK_COPY` is gone from `progression/support.ts`. Nothing under
`core/` or `progression/` may name anything, because neither knows what language
is on screen, and the test looks for the shape rather than the name.

→ `docs/design/i18n.md`, `docs/phases/phase-44.md`

### Asked for after it: the comments came out

Every prose comment was stripped from `src/`, `tests/` and `tools/` — 9,130
lines, 474 KB, 36% of the source. The code is unchanged: the production build is
**byte-for-byte identical**, because the minifier was already dropping all of
it. `tools/strip-comments.mjs` and `tools/strip-comments.py` do the work and are
kept; both use a real parser rather than a regex, and the reason is the one bug
the first attempt had — a line rule that drops anything starting with `#` also
ate two markdown headings out of a docstring in `tools/derive-clips.py`.

Directives stayed: `svelte-ignore`, the `i18n-exempt` markers
`tests/i18n.test.ts` reads, `@ts-*`, and the shebangs.

**What the comments were carrying is now `docs/design/invariants.md`.** Most of
them were rationale that the specs already hold, but a smaller set was
implementation detail with a trap in it — `MAX_CATCHUP_SECONDS`, the boss
phase's forward-only guard, the Spotter's `chargeInterval` sitting exactly on
its floor, the `untrack` that stops the pause menu recursing. Those were written
down nowhere else and are invisible from the code. Each entry says what breaks
and points at the spec that owns the decision.

---

## What came before — Phase 43, menus, settings, accessibility

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

### Asked for after it: a sidebar, a pause button, and a way to stop

Every panel was reachable **only** by keyboard shortcut, with the HUD's hint
line as the entire discovery path. `ui/Sidebar.svelte` puts a row of buttons on
the right edge; each carries its keycap, so it teaches the shortcut rather than
replacing it, and it sets the same store flag the key handler does — no panel
changed.

A pause button now sits under the Output bar, and **standby** is a third way
time can stop: the player stands the stage down, the field goes clean and
empty, and nothing happens until they begin. It rebuilds the stage rather than
freezing it — freezing would leave Contacts hanging mid-approach and then drop
them onto a formation arranged while they were harmless. The cost is the waves
already cleared, and the banner says so.

`wave-gap` is the Approach's re-slotting window: a few seconds, on its
schedule. Standby is the same window with no clock on it.

### Two bugs fixed after it, both on the same unit

A player reported that **upgrading a Spotter did nothing until it was unmounted
and mounted again.** Both findings are worth keeping:

- **Reconciliation only ever added and removed units.** A unit's derived numbers
  — level scale, max HP, charge capacity, recharge rate, attack multiplier — are
  cached on the instance at creation, which is right; what was missing was the
  other half of the bargain, invalidating them. `syncFieldToSave` now
  **refreshes** what stays put. It applied to Platform levels too, unreported.
  The reconciler moved out of `bootstrap.ts` into `core/fieldSync.ts` as part of
  the fix, because a rule inside a module that imports Pixi is a rule no test
  can reach — and this one had been wrong for thirteen phases.
- **The Spotter's recharge track was priced, offered, and did nothing.** It is
  authored at `chargeInterval: 4.5`, exactly `SUPPORT.recharge.floorSeconds`.
  The floor is a deliberate hard bound (combat-spec.md §4), so the tuning was
  right and the *offer* was wrong. `buyTrack` now refuses a purchase that cannot
  move a number, and the roster shows the track as maxed.

**An upgrade raises the ceiling; it does not change the current state.** HP and
charge are clamped to the new maximum, never scaled to it — repairs cost
Salvage, and an upgrade must not be a cheaper repair.

---

## The phase before that — Phase 42, HUD & core UI

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

- [ ] **Watch the language change with the game running.** The Browser pane this
      project is driven from does not composite frames, so Svelte's DOM effects
      never flush — a plain write to `game.output` does not move the HUD either.
      Components mounted *after* a switch were confirmed to render in the new
      language, and the overflow audit was measured in the pseudolocale, but the
      redraw-on-switch path is argued from the code rather than observed.

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
docs/design/invariants.md    what breaks quietly if you change it
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
src/lib/i18n/                the catalogue, the translator, the QA language
tests/                       47 files; support/playthrough.ts drives whole runs
```

Five boundaries that must not erode, all in `docs/architecture.md`:

1. Nothing under `core/`, `systems/`, `entities/` or `content/` imports Svelte,
   Pixi or a browser API — except the two output files named above.
2. `render.ts` reads simulation state and never writes it.
3. Nothing under `ui/primitives/` imports `stores/`. A primitive that reads the
   game is a screen with fewer props.
4. No component registers a window `keydown` handler. `bootstrap.ts` routes
   every key, including Escape, because it is the only place that knows what is
   open. See `docs/design/ui-spec.md` §7.
5. No component types English into its markup — text node or `title=` alike —
   and none reads the language through `i18n/` rather than through `stores/`.
   See `docs/design/i18n.md`.

---

## Running it

```bash
npm run dev          # http://localhost:5173 — note: localhost, not 127.0.0.1
npm test             # 1098 tests
npm run check        # svelte-check + tsc
npm run build
npm run i18n:extract -- de Deutsch    # a translator's stub for a new language
```

Audio needs one click on the field before the browser will start it — that is
the browser's rule, not a bug. `H` opens the Manual, `Esc` the menu, and every key is rebindable.

The dev server binds to IPv6 localhost only, so `http://127.0.0.1:5173` will
*not* connect, and would be a different `localStorage` origin — a different save
— if it did.
