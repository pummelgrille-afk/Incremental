# Phase 42: HUD & Core UI System

**Stage 6 — UI/UX & Accessibility** (first phase)
Output: `ui/primitives/` (8 components), `utils/delta.ts`, `utils/format.ts`,
tokens in `styles/app.css`, `docs/design/ui-spec.md`, `tests/delta.test.ts`,
`tests/ui.test.ts`, and every existing screen rewritten onto the set

## Checklist

- [x] Always-on Output, resources and wave/stage indicator
- [x] Shared primitives — buttons, panels, tooltips — used across the HUD, the
      Almanac, the Formation editor, the map and both modals
- [x] Gain/loss animations for readability during fast combat
- [x] The set enforced mechanically, not by review

## The phase was a deduplication, not a new screen

The HUD, the map, the Rewind modal, the offline summary, the Formation editor
and the Almanac all existed and all worked. What PLAN.md asks for at Phase 42 is
the layer *underneath* them, and the argument for building it now is what a
count of the duplication turned up:

| Duplicated | Copies | How they had drifted |
|------------|--------|----------------------|
| Scrim + dialog | 3 | Alphas 0.72 / 0.80 / 0.82; one had a different border |
| Full-screen overlay | 2 | Aside 19rem / 20rem |
| `button` rules | 5 | Two padding scales, two radii, two disabled states |
| `kbd` rules | 4 | Three sizes, two colours |
| `z-index` | 6 files | `10`, `15`, `20`, `30`, chosen one at a time |
| Danger red | 4 files | Two different meanings |

Not one of those is a bug, which is exactly why they accumulated: every
individual copy looks correct in review. They are only wrong together.

Eight primitives now own that chrome — `Modal`, `Overlay`, `Button`, `Kbd`,
`Meter`, `Stat`, `Delta`, `Tooltip` — and the full set, with the rules about
which is which, is in `docs/design/ui-spec.md`.

## Three things the deduplication found

**Nothing focused the dialog it opened.** All three modals set `tabindex="-1"`
on the panel and none of them ever called `focus()`. Escape worked only because
each had registered its own handler on the window, and a tab press from an open
Rewind modal walked into the HUD behind the scrim. `Modal` now moves focus on
open. This is the fifth time this project has found a thing that was *authored*
and never *connected* — after `assetKey`, `PLATFORM_COLOURS`, the volume
settings and the conjunction burst.

**The hover card clamped against a guess at its own height.** The Formation
editor carried `CARD_ESTIMATED_HEIGHT = 250`. Measured in the running game the
card is 310–330px depending on whether the unit is locked, so the clamp was
protecting the bottom edge of a window 60–80px taller than the real one.
`Tooltip` measures itself with `bind:clientHeight`, which costs a frame and
cannot be wrong.

**The same balance was printed two ways.** The HUD abbreviated past a thousand;
the Formation and Almanac headers printed in full. A player moving between them
saw `11.83K` become `11833` and had to work out those were the same number.
`utils/format.ts` has one `compact`, and it **truncates rather than rounds** —
a balance displaying 1.71K while refusing a purchase costing 1706 is a bug
report.

## Gain and loss: frequency, for the third time

PLAN.md asks for "gain/loss animations for readability during fast combat", and
the interesting half of that turned out to be arithmetic rather than CSS.

Salvage lands dozens of times a second at a full formation and the Sun is hit at
a comparable rate. A float per event is a strobe, and a strobe is not a readout
— the player ends up reading the balance instead, which is the thing the
animation was supposed to save them from. **What an effect costs is how often it
fires**, which is the lesson Phase 40 learned from particles and Phase 41 learned
from sound, arriving now in the DOM.

So `utils/delta.ts` pools movement over 1.1 seconds and reports it once: "+240
in the last second". It is framework-free and unit-tested, because a rule living
in a template is a rule nothing can test. Two rules in it are worth keeping:

- **The freshest movement wins.** Movement one way clears the other way. A
  player cannot read "+40" and "−12" side by side as anything but a
  contradiction, and spending Salvage must not leave the kill that funded it
  still advertised.
- **The first value is adopted in silence.** The projection starts at zero and a
  loaded save does not, so without it the first frame of a session reports the
  whole balance as income — and the first frame of every *stage* reports full
  Output as a repair.

What is new on screen: **Output now says when it is being hit.** It previously
had a bar that eased its width over 120 ms and nothing else, so under a full
formation it could lose a fifth of its width between two glances and never be
seen moving. It now carries a pooled `−N` and the bar flashes its own border.

The rule the phase settled on, written down in ui-spec.md §4: *a number the
player must react to gets a float; a number they merely need to know does not.*
Clearance and Recollection move on the scale of a run and are drawn quiet.

## `tests/ui.test.ts`

The same argument `tests/boundaries.test.ts` makes about layers. These rules are
broken by reflex — one convenient `<button>`, one `z-index: 21` — and each
individual break looks fine. Eight assertions, each naming something that had
already happened:

- Buttons and keycaps are styled only in `primitives/`
- No screen hand-rolls a dialog
- Every `z-index` is a `--z-*` token
- A primitive never reads the store, and never imports a screen
- Four specific colour literals are read from tokens instead

Plus one guard that the sweep is looking at anything at all: a mechanical test
over a file list that silently becomes empty passes forever.

## Two places the set was deliberately not used

**StageSelect's stage tiles are not `Button`s.** A stage is a place on a map
that can be current, cleared or sealed. None of the three variants describes
that, and forcing it through would have meant a fourth variant used exactly
once — which is how a shared set stops being shared. The rule the test enforces
is narrower and firmer: no screen may style the bare `button` element.

**The clear/lost banner is not a `Modal`.** It reports rather than asks, takes
no focus and blocks nothing.

## One improvement that came free

`Tooltip` needed a second consumer to be worth its file, and the Almanac was the
obvious one: node names and costs were readable only by *selecting* a node,
which destroyed the planning state — the highlighted prerequisite path — that
the player had built up. Browsing had to cost planning, which is backwards.
Hovering a node now raises a card, and the selection is untouched. It is
suppressed while panning, and it also raises on focus, so it exists for a
keyboard.

## What is not done

Accessibility proper is Phase 43, and this phase deliberately stopped at what
was cheaper to build than to retrofit: focus into a dialog, drawn focus rings,
`Meter` as a real `progressbar`, tooltips on focus as well as hover. Still
missing, and Phase 43's:

- A focus **trap** inside an open dialog, and restoring focus to whatever
  opened it
- `screenShake`, `reducedMotion`, `colourblindPalette` and `textScale`, which
  have been in `saveSchema.ts` since Phase 8 and are read by nothing.
  `reducedMotion` in particular now has something to switch off: `Delta`'s
  floats and `Meter`'s flash are the first animations in the chrome
- A settings UI at all — the three volume faders still have no control surface

## Files

| File | Is |
|------|-----|
| `src/lib/ui/primitives/Modal.svelte` | Dialog over the running field |
| `src/lib/ui/primitives/Overlay.svelte` | Full-screen work surface |
| `src/lib/ui/primitives/Button.svelte` | Three variants, one disabled state |
| `src/lib/ui/primitives/Kbd.svelte` | A key, drawn as a key |
| `src/lib/ui/primitives/Meter.svelte` | A bar reporting a fraction |
| `src/lib/ui/primitives/Stat.svelte` | A labelled figure |
| `src/lib/ui/primitives/Delta.svelte` | A pooled gain or loss, floating |
| `src/lib/ui/primitives/Tooltip.svelte` | Self-measuring, flipping hover card |
| `src/lib/utils/delta.ts` | The pooling rule |
| `src/lib/utils/format.ts` | `compact`, truncating |
| `src/styles/app.css` | The tokens and the stacking order |
| `docs/design/ui-spec.md` | Source of truth for all of it |
