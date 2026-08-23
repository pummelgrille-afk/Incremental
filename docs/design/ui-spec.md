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

In `src/lib/ui/primitives/`. Twelve files, one component each — eight from
Phase 42, four more added by Phase 43's settings screen.

| Primitive | For | Consumers |
|-----------|-----|-----------|
| `Modal` | A dialog over the running field | StageSelect, PrestigeModal, WelcomeBack, MainMenu, SettingsMenu |
| `Overlay` | A full-screen work surface | FormationEditor, UpgradeTree |
| `Button` | Every action | 7 screens |
| `Kbd` | A key, drawn as a key | HUD, Tutorial, MainMenu, SettingsMenu, both overlays |
| `Meter` | A bar reporting a fraction | HUD ×2 |
| `Stat` | A labelled figure | HUD ×5, PrestigeModal, WelcomeBack, MainMenu |
| `Delta` | A pooled gain or loss, floating | HUD ×4 |
| `Tooltip` | A card beside whatever is hovered | FormationEditor, UpgradeTree |
| `Field` | A labelled setting, with the line explaining it | SettingsMenu |
| `Toggle` | On/off, drawn from a real checkbox | SettingsMenu ×3 |
| `Slider` | A continuous value, with its reading | SettingsMenu ×3 |
| `Choice` | One of a handful, all visible at once | SettingsMenu ×2 |

`Sidebar` is a screen, not a primitive, and its rows are not `Button`s for the
same reason StageSelect's stage tiles are not: the three variants are statements
about what an action *does*, and a navigation tab is a place — one you can
already be in.

The four settings controls are all **real form elements**, visually restyled
rather than replaced. Space, arrow keys, the label association and every
assistive technology on earth keep working — none of which a div with a click
handler gets, and all of which Phase 43 was specifically about. Enforced by
`tests/ui.test.ts`.

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

## 5. Accessibility

Started in Phase 42 where it was cheaper to build than to retrofit, finished in
Phase 43:

- **Focus moves into a Modal when it opens, stays inside while it is open, and
  goes back where it came from when it closes.** The trap recomputes what is
  focusable on each Tab rather than caching it at open: these panels change
  what they contain while they are up — the Rewind grows a confirm button, the
  settings screen swaps a keycap for "press a key" — and a list captured at open
  time sends Tab to a control that no longer exists.
- **Focus is drawn, not inherited.** The platform ring is invisible against a
  dark panel on several browsers, so every interactive thing draws its own.
  `tests/ui.test.ts` fails on a file that styles a control and no focus ring.
- **`Meter` is a `progressbar`** with its value announced, rather than a styled
  div.
- **`Tooltip` also raises on focus**, not only on hover, so the unit and node
  cards exist for a keyboard.
- **Every action has a key, including the Flare**, which was mouse-only until
  Phase 43. See section 7.

### The four settings

`screenShake`, `reducedMotion`, `colourblindPalette` and `textScale` sat in
`saveSchema.ts` from Phase 8 to Phase 43 read by nothing, because there was no
screen to put them on. What each reaches now:

| Setting | Reaches |
|---------|---------|
| `textScale` | `--text-scale` on the root, so every `rem` follows — one line, because every size in this project was already in `rem` |
| `reducedMotion` | `data-reduced-motion` on the root; one CSS rule covers the whole chrome, plus the sparks and the shake |
| `colourblindPalette` | `content/palettes.ts`, selected by `render.ts` |
| `screenShake` | A capped six-pixel kick when the Sun takes damage, and nothing else in the game |

**Reduced motion reaches the chrome, never the field.** The floats, the flashes,
the toast, the sparks. A Platform that stopped orbiting would not be a calmer
game, it would be a broken one.

**The system preference wins over the in-game toggle.** Someone who set
`prefers-reduced-motion` has already answered the question, and a game treating
its own default as an override is how that preference comes to mean nothing.
The settings screen says so when it applies, so a toggle that looks stuck is
explained rather than merely stuck.

### Colour

The default palette puts four of the five colours a player must tell apart on
the red-green axis. `content/palettes.ts` carries three alternatives, separated
on **two** channels — hue and lightness — because each deficiency leaves roughly
one usable hue axis, and four values along one axis are four points on a line.

`tests/palettes.test.ts` simulates each deficiency and asserts the pairs stay
apart, including the one art-style.md section 6 rule 1 says matters most:
incoming fire against your own.

---

## 6. Reaching a panel

Two routes to every panel, and they are the same route underneath: the sidebar
sets the same store flag the key handler sets, so no panel knows or cares which
was used.

**The sidebar exists because the keys were the only way in.** Until it was
added, the Formation editor, the map, the Almanac and the Rewind were reachable
*only* by shortcut, and the HUD's hint line was the entire discovery path. A
hint line is something a player reads once and then stops seeing. A row of
buttons is the thing they find by looking.

Each row carries its keycap, so the sidebar teaches the shortcut rather than
replacing it — and the HUD's hint line, which used to list all seven, now lists
none of them. A keycap belongs on the button it opens, not in a legend under the
field. The one line that stayed is the Flare's, because it is the only action
with no button anywhere: clicking the field is discoverable, the key is not.

**It hides whenever a panel is open.** Overlays and modals cover it by
`--z-overlay` and `--z-modal` anyway, but a button that is under a scrim and
still tabbable is exactly the trap the focus work exists to close.

**Rows follow the reveals.** The Almanac appears when the tree is revealed, the
Rewind when it unlocks — economy-spec.md section 3 wants a first-time player
meeting one progression system at a time, and a permanent row for a system that
does not exist yet argues the opposite.

### Three ways time stops

| | What it is | What it looks like |
|---|---|---|
| `wave-gap` | The Approach's re-slotting window, a few seconds, on its schedule | The field keeps moving |
| **Pause** | The player asking for a moment | Everything freezes exactly where it is |
| **Standby** | The player standing the stage down | Clean, empty field; the stage restarts when they begin |

Pause and standby are separate on purpose and cannot be confused: pause is a
freeze-frame, standby is a stopped shift. Standing down releases a pause,
because a pause on top of a stopped field is two brakes and one confusing
banner.

Standby was asked for by a player who wanted to rearrange a formation without a
wave landing on it — a fair thing to want in a game whose whole pitch is that it
runs without you. It **rebuilds the stage** rather than freezing it where it
stands: freezing would leave the Contacts that were mid-approach hanging over
the rings for as long as the player took to think, and un-freezing would drop
them onto a formation arranged while they were harmless. The cost is the waves
already cleared on that stage, and the banner says so rather than letting the
player discover it.

---

## 7. Keys

Ten actions, in `content/keybindings.ts`; resolution and repair in
`core/keybindings.ts`, DOM-free and tested.

**Bindings are a position, not a letter.** Stored as `event.code`, so the
defaults keep their shape under one hand on AZERTY and Dvorak, where `event.key`
for the same physical key is a different letter.

**Conflicts are surfaced, not refused.** Doubling two panels onto one key is a
choice. What was impossible before was seeing that you had.

**Escape is fixed.** A player who binds everything to one key must still be able
to reach the screen that would let them fix it.

---

## 8. Escape belongs to the router

`bootstrap.ts` owns the key handler, and it listens in the **capture phase**.
No component may register a window `keydown` handler; `tests/ui.test.ts` fails
if one appears.

This is not tidiness. When each open `Modal` listened on the window:

- one Escape with two panels stacked closed **both**, and
- closing the last one raced the router — which runs "close the topmost screen,
  or open the menu if nothing is open" — into reopening the menu it had just
  dismissed, because in the bubble phase it arrived after the dialog had already
  closed itself.

Escape is a binding like any other, and only one place knows the whole stacking
order. `closeTopmost` walks section 2's order from the top down, notices first:
a card or a toast is the least deliberate thing on screen, and the most likely
thing a player is swatting at.

---

## 9. No English in a template

Every string a player reads comes from `i18n/`. `docs/design/i18n.md` is the
source of truth for how; the rules that belong to *this* document are the two a
component author trips over.

**A component may not type a sentence.** Not in a text node, and not in a
`title=`, `label=`, `aria-label=` or `placeholder=` — the attribute half is the
easy one to forget, because it does not look like copy, and it is read by
exactly the player who was unsure enough to hover. `tests/i18n.test.ts` sweeps
both, `App.svelte` included.

Two exemptions, both marked in the source:

- `<!-- i18n-exempt: … -->` around a region written for a developer. Today only
  the diagnostics panel.
- Key labels. `bindingLabel()` says "Space" and "Esc"; a keycap's text is the
  keyboard's word, not a component's.

**A component reads the language through `stores/i18n.svelte.ts`, never through
`i18n/translate.ts` directly.** The store passes the locale as an argument, so
Svelte tracks it; the bare functions read a module variable and would render the
right words exactly once. `T.svelte` — a sentence with a keycap or an emphasised
run inside it — is the only component that touches `i18n/` for anything, and it
takes the parser, not the locale.

A slot that cannot wrap needs a budget in `i18n/budgets.ts`. Before adding one,
check whether it could wrap instead: that is the fix, and the budget is the
consolation prize.
