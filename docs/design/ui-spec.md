# UI spec

Source of truth for the chrome: the primitive set, the tokens it reads, and the
rules about which is which. Established in Phase 42, which found eight screens
that had each solved the same four problems separately.

Nothing here is about taste. Every rule below names something that had already
drifted, and most of them are checked by `tests/ui.test.ts` rather than left to
review.

---

## 1. What was wrong

Eight components, 2,779 lines, and inside them:

| Duplicated | Copies | How they had drifted |
|------------|--------|----------------------|
| Scrim + dialog | 3 | Alphas 0.72 / 0.80 / 0.82; one had a different border |
| Full-screen overlay | 2 | Aside 19rem / 20rem; one set a base font size, one did not |
| `button` rules | 5 | Two padding scales, two radii, two disabled states |
| `kbd` rules | 4 | Three sizes, two colours |
| Hover card | 1 | Clamped against a hardcoded guess at its own height |
| `z-index` | 6 files | `10`, `15`, `20`, `30`, chosen one at a time |
| Danger red | 4 files | Meant "the Sun is dying" *and* "this control is disabled" |

None of these is a bug. Each is a small decision made twice, and the cost is
paid by the player rather than the author: a label that is 0.65rem in the HUD
and 0.62rem in the Rewind modal costs a fraction of a second of re-reading every
time they move between the two.

---

## 2. The tokens

In `src/styles/app.css`, on `:root`. A component reads them; it never retypes a
value one of them owns.

| Token | Is |
|-------|-----|
| `--bg` `--text` `--muted` | The ground and two weights of type |
| `--corona` `--corona-dim` | The Sun's gold: anything active, anything spendable |
| `--danger` | Output being lost. **Only that.** |
| `--warn` | A refusal the player can still act on |
| `--well` | A recessed surface: an empty meter, a keycap |
| `--inert` | A control that is off |
| `--scrim` | A modal's cover — translucent, because the field keeps running |
| `--overlay` | A work surface's cover — opaque, because it does not |
| `--radius` | The one corner radius small chrome uses |
| `--z-hud` … `--z-tooltip` | The stacking order, below |

### The stacking order

Five layers, in the order a player meets them:

```
--z-hud      5   over the field
--z-overlay 10   a screen the player opened; covers the HUD
--z-notice  15   an onboarding card or a toast; unasked-for
--z-modal   20   an interruption; covers everything below
--z-tooltip 30   explains whatever is under the pointer, so always last
```

A notice sits above an overlay and below a modal. That is the order the two
notice components were already using, and it is the right one: the Manual has to
be able to explain the screen the player is looking at, and nothing may talk
over a decision that cannot be undone.

`tests/ui.test.ts` fails on a bare numeric `z-index` anywhere under `ui/`.

---

## 3. The primitives

In `src/lib/ui/primitives/`. Eight files, one component each.

| Primitive | For | Consumers |
|-----------|-----|-----------|
| `Modal` | A dialog over the running field | StageSelect, PrestigeModal, WelcomeBack |
| `Overlay` | A full-screen work surface | FormationEditor, UpgradeTree |
| `Button` | Every action | 5 screens |
| `Kbd` | A key, drawn as a key | HUD, Tutorial, and both overlays' hints |
| `Meter` | A bar reporting a fraction | HUD ×2 |
| `Stat` | A labelled figure | HUD ×5, PrestigeModal, WelcomeBack |
| `Delta` | A pooled gain or loss, floating | HUD ×4 |
| `Tooltip` | A card beside whatever is hovered | FormationEditor, UpgradeTree |

### Modal or Overlay

The distinction decides everything else about the screen:

- A **modal** is an interruption to the run. The field keeps running behind it,
  so its cover is translucent — a player deciding whether to Rewind should be
  able to see what the decision is costing them.
- An **overlay** is a break from the run. It hides the field, because arranging
  a formation against a moving starfield is the same information twice.

### Button's three variants

`primary` is what the panel is for. `ghost` is a way out or a secondary tool.
`danger` is a step that cannot be taken back. A fourth variant would mean the
set had stopped describing intent and started describing colour.

**Not everything clickable is a Button.** StageSelect's stage tiles are places
on a map that can be current, cleared or sealed — none of the three variants
describes that, and forcing it through would mean a fourth variant used exactly
once. The rule the test enforces is narrower and firmer: no screen may style the
bare `button` element.

### What a primitive may not do

- **It never reads the store.** A primitive that reaches into `game` is a screen
  with fewer props: it only works where that state means what it meant the first
  time, and the next caller copies it instead of using it. Enforced.
- **It never imports a screen.** Enforced.
- **It owns its own chrome and nothing else.** Layout *around* a primitive
  belongs to the screen placing it.

### A note on snippets and scoped styles

Svelte scopes styles to the component that authors the markup. Markup passed in
as a snippet is therefore styled by the *caller*, not the primitive — so
anything a primitive must style consistently is a **prop**, not a snippet.
`Modal` takes `title` as a string; `Overlay` takes `balances` as data. Passing
those as snippets would have meant every caller retyping the rules, which is the
duplication the set exists to end.

---

## 4. Gain and loss

PLAN.md Phase 42 asks for "gain/loss animations for readability during fast
combat". The rule that fell out of building them:

> **A number the player must react to gets a float. A number they merely need to
> know does not.**

Output and Salvage move on the scale of a second and carry deltas. Clearance and
Recollection move on the scale of a run and are drawn `quiet` — a counter that
never changes, competing for attention with one that always does, is noise
sitting on top of signal.

### Pooled, because frequency is the design problem

Salvage lands dozens of times a second at a full formation, and the Sun is hit
at a comparable rate. A float per event is a strobe, and a strobe is not a
readout — the player ends up reading the balance instead, which is the thing the
animation was there to save them from.

So movement accumulates over a 1.1-second window and is reported once:
"+240 in the last second", not two hundred numbers. The rule lives in
`src/lib/utils/delta.ts`, framework-free and tested, because a rule living in a
template is a rule nothing can test.

This is the same lesson art-style.md §6 rule 8 records for particles and
phase-41.md records for sound, arriving a third time: **what an effect costs is
how often it fires.**

### The freshest movement wins

A `PooledDelta` clears one direction when the value moves the other way. A
player cannot read "+40" and "−12" side by side as anything but a contradiction,
and the older of the two is the one they have already seen.

### Direction is carried by the motion

A gain floats up, a loss floats down. Legible at a glance and in peripheral
vision, which is where a HUD is actually read.

### Ease a bar that steps; never one that streams

`Meter` takes `instant` for exactly this. A 120 ms width transition on a value
updated at 60 Hz reports a state the player has already left — which is why the
Flare's charge bar had to cancel the Output bar's easing by hand before this
existed.

---

## 5. Accessibility, so far

Phase 43 owns accessibility. What Phase 42 put in place because it was cheaper
to build than to retrofit:

- **Focus moves into a Modal when it opens.** None of the three hand-rolled
  dialogs did; Escape worked only because the handler was on the window, and a
  tab press walked the HUD behind the scrim.
- **Focus is drawn, not inherited.** The platform ring is invisible against a
  dark panel on several browsers, so `Button` and the stage tiles draw their
  own.
- **`Meter` is a `progressbar`** with its value announced, rather than a styled
  div.
- **`Tooltip` also raises on focus**, not only on hover, so the unit and node
  cards exist for a keyboard.

What is still missing, and belongs to Phase 43: a focus trap inside an open
dialog, restoring focus to the control that opened it, and the four settings in
`saveSchema.ts` that are still read by nothing.
