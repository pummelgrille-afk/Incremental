# Phase 44: Localization Pipeline

**Stage 6 — UI/UX & Accessibility**
Output: `src/lib/i18n/` (catalogue, translator, pseudolocale, budgets),
`stores/i18n.svelte.ts`, `ui/T.svelte`, `tools/i18n-extract.mjs`,
`docs/design/i18n.md`, `tests/i18n.test.ts`, `settings.locale` in the save

## Checklist

- [x] Externalize all UI text, starting with the primary language
- [x] Externalize content text — unit, zone, stage, node, achievement and card
      names and descriptions
- [x] A pipeline for adding a language post-launch — `npm run i18n:extract`
- [x] QA text overflow and wrapping across languages
- [x] A language picker, persisted in the save
- [ ] **A second real language** — not shipped, and deliberately: the brief asks
      for one chosen from audience data, and there is no audience yet. See
      "What is not done"

## What moved

542 strings, in two halves that are kept apart on purpose.

| | Chrome | Content |
|---|---|---|
| Count | 264 | 278 |
| Was | Typed into 23 templates | Authored in `content/*.ts` |
| Is | `i18n/en/*.ts`, seven files by surface | Still in `content/*.ts` |
| Keyed by | `hud.paused.title` | `platform.bolt.name`, derived from the id |

**Content English did not move, and that is the one structural decision worth
defending.** `CLAUDE.md` says content is typed data, and a Platform's name
belongs beside its attack and its interval — an author balancing a unit should
not open a second file to find out which one they are looking at. Hoisting 140
names into the catalogue would have bought compiler-checked keys at the price of
turning every content file into a list of ids. A translation *overrides* by key
instead, and the authored English is the fallback.

Both halves fall back **per key**. A locale with the chrome translated and none
of the units is a playable game in that language with English unit names.

## The pseudolocale is a rule, not a table

PLAN.md asks this phase to QA overflow "across languages", and there is exactly
one language. So the QA language is generated: `LOCALES` gives `qa` a
`transform` instead of messages, applied to the English source at lookup time.

The consequence is the point. It covers all 542 strings — including the 278 in
`content/`, which no hand-written QA file would have kept in step — and it costs
no bytes. The same argument as the starfield, the particles and the score
(`art-style.md` §8): *generated beats authored, where a rule can do the job.*

It expands hardest on the shortest strings, which is the shape real translation
takes, and it wraps everything in `⟦…⟧` so a clipped string reads as a missing
bracket rather than as a judgement call.

## What running the game in it found

**The palette row went through the side of the dialog.** `Choice` was
`display: inline-flex` with `white-space: nowrap` on every option, and the
palette row is already 39 characters of English in a 38rem modal. It fit
English and nothing else. Fixed by wrapping, which is the right fix — a budget
would only have told us how far we were from the cliff.

Measured after: the whole document, in `qa`, has **zero** elements whose
`scrollWidth` exceeds their `clientWidth`, and the sidebar — the widest thing
the pseudolocale touches — is 167px at a 1280px viewport, against the ~200px the
budget assumed.

**Three sidebar tabs were quietly renamed.** Reaching for `term.*` for the tab
labels turned "Almanac" into "The Almanac", "Manual" into "The Manual" and
"Perihelion" into "The Perihelion" — four characters each, on the six labels
with the least room in the game. They have their own keys now. A tab is a place;
the article belongs on the title bar of the thing it opens.

**Two keycaps were still hardcoded letters.** The Almanac's hint said `T` and the
formation editor's said `F`, printed as literals rather than read from the
bindings — the exact thing Phase 43 fixed in the HUD and missed in two panels.
A hardcoded hint stops being a help the moment the key is rebound, and lies to
the player who needed it. The clear and overwhelmed banners had the same problem
with `R`, and the paused banner with `Esc`. All five read `bindingLabel` now.

**`App.svelte` carried the one string with the worst ratio of importance to
visibility**: "The Perihelion did not start." — the sentence shown when nothing
else works, in a file the `ui/` sweep did not cover. The sweep covers it now.

**An enum member is not a label, and three components each disagreed
separately.** `role`, `targeting`, `damageType`, the conjunction kinds and the
Almanac's twelve effect names were being turned into English by hand — one as a
`Record` of sentences, one as a `Record` of words, one by printing the raw
member. They are in `i18n/en/terms.ts` once, and the effect line is now three
shapes (`{sign}{value}% {term}`) rather than twelve sentences that all say the
same thing.

## The reactivity trap, and why the locale is an argument

`stores/i18n.svelte.ts` holds one rune. The first version read it for effect —
`void state.code` at the top of `t()` — which works and is indefensible: it
reads as dead code, and the day somebody deletes it the game keeps working until
a player changes language, at which point half the screen stays in the old one.

Every function in `translate.ts` now comes in a pair. `translateIn(locale, …)`
takes the locale, so the store passes what it holds in the rune and Svelte sees
an ordinary dependency. The bare `translate()` reads a module variable and
exists for callers with nothing to be reactive to — `core/save.ts` building an
`Error` is the only one in the game. A component calling it would render the
right words exactly once, so the test refuses one that does.

## Refusals carry a key, not a sentence

`SaveImportError` took an English string and the settings panel printed it.
It takes a `MessageKey` and its params now; `message` is still the English one,
because an `Error` that says nothing in a stack trace is a worse tool than one
that does. Same rule, one layer down: `core/` has no business knowing which
language the player reads.

The same pass removed `TRACK_COPY` from `progression/support.ts` — three Array
track names and their effects, sitting in a projection. A projection cannot be
translated, because nothing under `progression/` may know what language is on
screen. `TrackView` carries the track's id and the editor looks the words up.
`tests/i18n.test.ts` looks for the shape rather than the name, so the next one
fails the build.

## Budgets, and what a failed one means

`i18n/budgets.ts` covers only slots where the CSS refuses to reflow — nowrap,
ellipsis, or a fixed-width tile. Twenty-two keys. Each budget is the slot's
usable width over an average glyph advance of 0.55em, and the test checks the
English **and its pseudolocale expansion**: English fitting proves nothing about
German.

A failed budget is a question. Let the slot wrap, shorten the English, or widen
the slot — in that order. Raising the number moves no pixels, and is the one
move that is never right.

## What is not done

**No second language.** The brief is explicit that languages come from audience
data after launch, and inventing one now would ship a translation nobody
reviewed, in a language nobody asked for, that every later content phase has to
keep in step. What this phase owes that decision is the *slot*: `npm run
i18n:extract -- de Deutsch` writes the file, three lines register it, and the
test suite checks it. The pipeline has been run; the artefact was deleted rather
than committed as a fake German.

**No detection from `navigator.language`.** Also a decision. A game that
silently switches to a half-finished translation because of a browser setting
reports its own audience data wrong.

**Live switching was not verified in a browser.** The Browser pane this project
is driven from does not composite frames, so Svelte's DOM effects never flush —
a plain write to `game.output` does not update the HUD either. Components
mounted *after* a language change were confirmed to render in it, and the
overflow audit above was measured in `qa`, but the redraw-on-switch path is
argued from the code rather than observed. It is the first thing to check on a
real browser.

## Files

| File | Is |
|------|-----|
| `src/lib/i18n/en/*.ts` | The English catalogue, split by surface |
| `src/lib/i18n/en.ts` | Composes them; defines `MessageKey` |
| `src/lib/i18n/parts.ts` | A message → literal runs and holes |
| `src/lib/i18n/translate.ts` | Look up, fall back, fill, pluralise |
| `src/lib/i18n/locales.ts` | Which languages exist |
| `src/lib/i18n/pseudo.ts` | The QA language, generated |
| `src/lib/i18n/budgets.ts` | Slots that cannot grow |
| `src/lib/i18n/content.ts` | Content keys, derived from ids |
| `src/lib/i18n/contentSources.ts` | Every content string, for the tool and the test |
| `src/lib/stores/i18n.svelte.ts` | The one rune |
| `src/lib/ui/T.svelte` | Markup inside a sentence |
| `tools/i18n-extract.mjs` | Writes a translator's stub, through Vite |
| `tests/i18n.test.ts` | 28 checks |
| `docs/design/i18n.md` | Source of truth |
