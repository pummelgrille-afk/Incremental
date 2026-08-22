# Phase 43: Menus, Settings & Accessibility

**Stage 6 — UI/UX & Accessibility**
Output: `ui/MainMenu.svelte`, `ui/SettingsMenu.svelte`, four more primitives,
`content/keybindings.ts`, `core/keybindings.ts`, `content/palettes.ts`, save
schema 8, the pause flow, `tests/keybindings.test.ts`, `tests/palettes.test.ts`

## Checklist

- [x] `ui/MainMenu.svelte` and `ui/SettingsMenu.svelte` — audio, video and
      rebinding
- [x] Pause flow
- [x] Colourblind-safe palettes for the field
- [x] Screen-shake toggle
- [x] Text scaling
- [x] Keyboard support alongside mouse
- [ ] **Controller support** — deferred, see "What is not done"

## The four dead settings are alive

`screenShake`, `reducedMotion`, `colourblindPalette` and `textScale` have been
in `saveSchema.ts` since Phase 8 and were read by **nothing** for thirty-five
phases. They were not forgotten so much as unreachable: there was no settings
screen to put them on, so every phase that could have connected one had no
surface to connect it to. This phase built the surface first, and connecting
them was the easy half.

| Setting | Now reaches |
|---------|-------------|
| `textScale` | `--text-scale` on the root element, so every `rem` in the project follows |
| `reducedMotion` | `data-reduced-motion` on the root, plus the particle field and the shake |
| `colourblindPalette` | `content/palettes.ts`, selected by `render.ts` |
| `screenShake` | The new shake, below |

**Text scale cost one line.** Every size in this project is in `rem` — which was
true before there was a setting to change it, and is the entire reason
connecting one was a root font size rather than an audit of forty files.

**Reduced motion is one CSS rule, not a flag threaded through components.** An
animation added in a later phase is covered by default rather than by someone
remembering to check a prop. It reaches the chrome only: the floats, the
flashes, the toast sliding in, the sparks. The field keeps moving, because the
field moving *is* the game — a Platform that stopped orbiting would not be a
calmer game, it would be a broken one.

**The operating system's preference wins over the in-game toggle.** Someone who
set `prefers-reduced-motion` has already answered the question; a game treating
its own default as an override is how that preference ends up meaning nothing.
The settings screen says so when it applies, so a toggle that appears stuck is
explained rather than merely stuck.

## The screen shake, and the pillar it argues with

PLAN.md asks for a screen-shake toggle. There was no screen shake, and P4 —
*legibility over spectacle, every time* — is an unusually strong version of that
rule in a game that asks a player to read hundreds of projectiles.

Built anyway, on the user's call, and scoped by the pillar rather than against
it: it fires on **one event**, the Sun losing Output, where a jolt is
information rather than decoration. Amplitude is proportional to the fraction of
the bar taken and capped at six pixels over about a fifth of a second — a boss
landing a quarter of the bar and a stray shot landing a hundredth must not feel
the same, and neither may throw the field off screen.

It is renderer-local state: `render.ts` reads the Sun's hp and remembers the
previous value itself, because rule 3 in architecture.md says a dropped frame
must never change what happens. The jitter comes from `Math.random`, never the
simulation's stream — the same rule the particle field follows, and for the same
reason.

## Colourblind palettes, measured rather than claimed

The default palette does what art-style.md asks: brass and warm light on a dark
field. It also puts **four of the five colours a player has to tell apart on the
red-green axis** — gold, orange, red, and a teal separated from blue only by
hue. For roughly 8% of men that is one colour with four names.

The three alternatives are not hue-shifts of the original. Each deficiency
leaves roughly *one* usable hue axis, so four values along it alone would be
four points on a line — the palettes separate on **two** channels, hue and
lightness:

| Palette | Axis | The four values |
|---------|------|-----------------|
| deuteranopia / protanopia | blue–yellow | bright yellow, dark amber, light blue, deep blue |
| tritanopia | red–green | red, deep red, green, deep green |

`tests/palettes.test.ts` simulates each deficiency (Viénot, Brettel & Mollon
1999, in `tests/support/colourVision.ts`) and asserts every pair a player must
distinguish stays apart by a minimum perceptual distance — including the pair
art-style.md §6 rule 1 says matters most, incoming fire against your own. That
simulation is test-only instrumentation: the game never needs to *simulate* a
deficiency, only to have a palette that survives one. Same argument as Phase
41's `AnalyserNode`.

**The tritanopia palette stops looking like the game**, and has to. A player who
cannot read the field is not enjoying the art direction either.

### What the test found about the default palette

The tightest pair in the shipped game, before any deficiency is applied, is
percussive gold against thermal orange at **88** — under the 90 floor the
accessibility palettes are held to. Recorded rather than fixed: widening it
means moving one of them out of the brass range art-style.md asks for, which is
an art decision rather than a threshold's call. It is also, unsurprisingly, the
pair that collapses completely under deuteranopia. If the palette is ever
retuned, this is the pair to spend the room on.

## Keys are data now

The bindings lived in `bootstrap.ts` as a run of `event.key === 'f'` comparisons
from Phase 10 until this phase. That worked, and could not be rebound, listed,
or told that two actions had ended up on the same key.

- **`content/keybindings.ts`** — ten actions, their defaults, their grouping.
- **`core/keybindings.ts`** — which action a stroke is, what may be bound,
  what conflicts. DOM-free: it takes a `KeyStroke` of four fields rather than a
  `KeyboardEvent`, so every rule is testable in a plain Node process.

**Bindings are stored as `code`, not `key`** — a position on the keyboard, not
the letter printed on it. On AZERTY or Dvorak, `event.key` for the same physical
key is a different letter, and the defaults (F, M, T, H, R, chosen as a shape
under one hand) would scatter across the board.

**Conflicts are surfaced, not refused.** Doubling two panels onto one key is a
choice; the thing that was impossible before was *seeing* that you had.

**Escape is fixed and unbindable.** A player who binds everything to one key
must still have a way back to the screen that would let them fix it, and Escape
closing things is not a preference — it is what a dialog means.

**The Flare has a key.** It was the one live input in the game and it was
mouse-only. `deepestContactPoint` picks the Contact closest to the Sun, which is
deliberately *not* the best shot available: a key that found the densest cluster
would be strictly better than aiming and would remove the one input this game
asks for.

## Two bugs found by driving it, not by reading it

Both were in Phase 42's `Modal`, both invisible until there were two dialogs to
stack, and this phase is the first to have two.

**One Escape closed two screens.** Every open Modal listened on the window, so a
press with the settings screen over the menu dismissed both.

**Escape reopened the menu it had just closed.** The router's rule is "close the
topmost screen, or open the menu if nothing is open". Running in the bubble
phase, it arrived *after* the Modal had already closed itself, found nothing
open, and helpfully opened the menu.

The fix is one decision: **Escape is a binding like any other, and the router
owns it.** `Modal` no longer listens on the window at all, and the router
listens in the **capture phase** so it reads the state before anything has
changed it. `closeTopmost` walks the stacking order from ui-spec.md §2 top-down,
notices first. `tests/ui.test.ts` now fails if any component adds a window
`keydown` handler back.

## The main menu is the pause menu

PLAN.md asks for a main menu, and this game does not have the screen that phrase
usually means. There is no title screen and no New Game: the save is the game,
it loads in under a second, and P1 says the machine runs without you — a front
door you must walk through to reach a simulation that has been running all along
is an obstacle in front of the pitch rather than an entrance to it.

So the menu is the one place that gathers what a player needs from *outside* the
run: where they are, what they have, how to stop it, how to change it, and where
the save lives. It pauses while open, and it is the only screen that does —
every other panel leaves the field running on purpose (ui-spec.md §3); this one
is the player saying *wait*.

**A pause stops simulated time and nothing else.** The renderer, the projection
and the frame counter keep running, so a paused game cannot be mistaken for a
crashed one. Paused time is not counted as playtime and does not feed the
offline earning rate, or an idle game would reward leaving itself paused.

## Accessibility, finished and not

Done here: the focus **trap** and focus restore that Phase 42 left open, real
`<input>` elements under every switch and segmented control rather than divs
wearing roles, and a focus ring on the one control in the game that had none —
the preset-name field, found by `tests/ui.test.ts` rather than by looking.

The save is also reachable now: export as a selectable string, import as a
paste box. Shown rather than downloaded, because a file the page hands the
player is a file some browsers refuse.

## What is not done

- **Controller support.** PLAN.md asks for "keyboard/controller"; this phase
  delivered the keyboard half. Deferred on the user's call for an honest
  reason: there is no controller in this environment, so it would ship
  untested — and a Gamepad API implementation that has never had a gamepad
  attached is a guess with a changelog entry.
- **Settings persist through the autosaver's coalescing**, not immediately.
  Consistent with `purchase`, and deliberate: a dragged volume slider firing a
  write per pixel is exactly the thrashing `minGapSeconds` exists to prevent.
  The `beforeunload` flush covers a fast tab close.
- **The default palette's tightest pair** is recorded above and left alone.
- **Judged by eye and by ear** — the palettes are measured against a simulation,
  which rules out the collapse they exist to prevent, but a palette that passes
  a distance threshold is not the same as one that looks right on a moving
  field.

## Files

| File | Is |
|------|-----|
| `src/lib/content/keybindings.ts` | Ten actions and their defaults |
| `src/lib/core/keybindings.ts` | Resolution, conflicts, repair — DOM-free |
| `src/lib/content/palettes.ts` | Four field palettes |
| `src/lib/ui/MainMenu.svelte` | The menu, on Escape. Pauses while open |
| `src/lib/ui/SettingsMenu.svelte` | Sound, legibility, keys, the save |
| `src/lib/ui/primitives/Field.svelte` | A labelled setting with its explanation |
| `src/lib/ui/primitives/Toggle.svelte` | A switch, drawn from a real checkbox |
| `src/lib/ui/primitives/Slider.svelte` | A value, with its reading beside it |
| `src/lib/ui/primitives/Choice.svelte` | A radio group, all options visible |
| `tests/support/colourVision.ts` | Viénot 1999, test-only |
