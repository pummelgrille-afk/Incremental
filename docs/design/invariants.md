# Invariants

Things that break quietly if you change them.

This file exists because the comments came out of the source. Most of what was
in them was rationale, and rationale already lives in the specs beside this
file — but a smaller set was **implementation detail with a trap in it**: a
constant that is deliberately equal to a bound, an ordering that prevents an
infinite loop, a call that must not run per frame. None of that was written
down anywhere else, and none of it is visible from the code alone.

## What this is not

Not a summary of the design. `combat-spec.md`, `economy-spec.md`,
`game-loop.md`, `ui-spec.md`, `art-style.md` and `i18n.md` own the *policies*,
and `architecture.md` owns the layer rules. Each entry below points at whichever
of those owns the decision, and only records the part of the implementation that
would silently violate it.

Not a list of everything that is tested. Where a test already fails on
violation, the entry says so — those are the safe ones. The dangerous entries
are the ones with no test named.

---

## 1. The loop and the field

**`core/loop.ts` — the simulation is 20 Hz, fixed, and rendering may not touch
it.** Rendering interpolates between states at display rate. A dropped frame
must never change the simulation, or Phase 35's reproducibility goes with it.
`architecture.md` §Layer boundaries; `combat-spec.md` for the rate.

**`core/loop.ts` — `MAX_CATCHUP_SECONDS = 0.5`.** A tab that was stalled for a
minute may only ever simulate half a second of it on the next frame. Without the
cap a backgrounded tab fast-forwards the field on return, which is both a
difficulty spike and free progress. Offline time is paid separately and
deliberately, by `systems/offlineProgress.ts`.

**`systems/synergy.ts` — two Platforms on the same ring can never be in
conjunction.** The search keeps a `Set` of rings already represented and skips
any candidate on one of them. Same-ring units hold a fixed angular relationship
forever, so they would either be permanently aligned or permanently not, and the
mechanic would stop being about arrangement. `combat-spec.md` §3.

**`systems/boss.ts` — a phase index only ever moves forward.** The transition is
guarded by `target > runtime.phaseIndex`. A boss can be healed above a phase
threshold — The Dark Watch summons a Warden that does exactly this — and without
the guard the fight oscillates between two phases and never ends.

**`systems/buffs.ts` — expiry zeroes the magnitude as well as the clock.** A
lapsed buff whose magnitude survived would still read as live to anything that
checks the number rather than the timer.

**`entities/Contact.ts` — content must not create a split cycle.** A Contact
that splits into itself, directly or through a chain, spawns without bound.
Nothing clamps it at runtime; the guard is `tests/spawn.test.ts`, which walks
the `splitsInto` chain.

**`systems/collision.ts`, `entities/Contact.ts` — hitboxes are decoupled from
sprite bounds, and generously so.** A shot that looks like a graze counts as a
hit. Tying the radius to the art means every art change is a balance change.
`combat-spec.md` §5.

**`content/scaling.ts`, `systems/scaling.ts` — over-level pressure is one-sided.
It is zero below the threshold and never negative.** Making it symmetric would
be rubber-banding, and the stall *is* the signal to Rewind — easing off when the
player is behind removes the thing the whole prestige loop is built on.
`economy-spec.md` §5, `game-loop.md`.

---

## 2. Progression and the economy

**`progression/upgradeTree.ts` — tree effects are additive, never
multiplicative.** Across ~72 nodes, multiplicative stacking compounds past any
curve `balancing.csv` can hold. `economy-spec.md` §2.

**`progression/upgradeTree.ts` — a path's cost is not the sum of its nodes'
current costs.** Each purchase raises its branch's depth, so the second node in a
chain is dearer than it looks today. `preview()` quotes the real total; anything
that adds up `nodeCost` under-quotes every multi-step path, which is the one
thing a planning affordance must not do.

**`progression/currencies.ts` — a stage clear is idempotent by construction.**
The second call sees the address already in `clearedStages` and awards nothing.
A double event or a reload at the wrong moment must not pay twice.
`economy-spec.md` §1.

**`progression/prestige.ts` — the zero-award guard.** A Rewind that would grant
no Recollection is refused with an explanation of the threshold. A player must
never be able to burn a run for nothing. `economy-spec.md` §1.

**`progression/loadout.ts` — a removal refunds at the price of the slot being
given up.** `removePlatform` deletes the entry *first*, then quotes
`slotCost(slotsUsed(save))`, so place-then-remove is exactly neutral. Quoting
before the delete would refund the next slot's price and turn the round trip
into a money printer.

**`content/economy.ts` — slot growth is `1.18`, and it is the load-bearing
number in the early economy.** Shallow enough that a tenth slot is reachable in
a first run, steep enough that a twentieth needs tree investment. Pinned by
`tests/currencies.test.ts` against what zone 1 actually pays out, not against a
threshold picked to match. `economy-spec.md` §1.

**`content/arrays.ts`, `progression/support.ts` — the Spotter's
`chargeInterval: 4.5` is exactly `SUPPORT.recharge.floorSeconds`, on purpose.**
The floor is a hard bound (`combat-spec.md` §4), so its recharge track can move
nothing. `movesTheNeedle()` is what makes `buyTrack` refuse the purchase and the
roster show the track as maxed. It looks like a typo and is not; a "fix" that
nudges it to 4.4 sells a track that then does almost nothing.

**`progression/support.ts`, `entities/Array.ts` — upgraded stats live on the
instance, never on the def.** Defs are immutable shared content (`CLAUDE.md`), so
a save that has bought upgrades must not be able to write into the roster every
other save reads.

**`core/fieldSync.ts` — an upgrade raises the ceiling and does not change the
current state.** HP and charge are clamped to the new maximum, never scaled to
it. Buying capacity must not also fill it; repairs cost Salvage, and an upgrade
must not become a cheaper repair.

**`core/fieldSync.ts` — reconciliation refreshes what stays put.** A unit's
derived numbers (level scale, max HP, charge capacity, recharge rate, attack
multiplier) are cached at creation, so a level bought while the unit is on the
field does nothing unless the reconciler invalidates them. This was wrong for
thirteen phases. `tests/fieldSync.test.ts`.

**`progression/achievements.ts` — an already-earned achievement never
re-fires**, whatever its trigger says. `evaluate()` returns only what was newly
awarded, so a caller can announce it without filtering.

**`progression/tutorial.ts` — an unsupplied price reads as `Infinity`, never
`0`.** A missing number that defaulted to zero would tell the player they can
afford something they cannot.

**`progression/tutorial.ts` — at most one card per moment, in authored order.**
That is what makes `content/tutorial.ts` a sequence rather than a set: a stage
clear can satisfy three triggers at once, and three cards at once is a wall.

---

## 3. Saves

**`core/saveSchema.ts` — `run` is discarded on Rewind and `meta` survives.** The
split is the whole reason the schema is shaped this way; a new field goes in
whichever half answers "does a Rewind take this away". `economy-spec.md` §3.

**`core/save.ts` — the write order is load-bearing** (ADR-002 requirement 2):
serialize to a temp key, read it back and confirm it parses, promote the current
save to backup, then swap temp into place. Reordering any two steps reintroduces
the window where a crash leaves no readable save.

**`core/saveMigrations.ts` — a migration speaks the vocabulary of its own
version.** It inlines the literals it needs rather than importing from
`content/`, because `content/` is today's shape and the migration is about
yesterday's. The 6→7 migration carries its own copy of the onboarding step ids
for exactly this reason.

**`core/saveSchema.ts` — validation repairs, it does not reject.** A save missing
a field added in a later build loads with that field defaulted; only structural
nonsense fails. A player's 25–40 hours matter more than schema purity.

**`utils/encoding.ts` — base64 goes through UTF-8 bytes.** `btoa` throws above
code point 0xFF. Save data is ASCII today, but content ids are authored text and
a single em dash would break exports silently.

---

## 4. Output: render, audio, art

**`core/render.ts` — reads simulation state, never writes it.** Enforced by
`tests/boundaries.test.ts`. `architecture.md`.

**`core/render.ts` — the Output arc and shield ring stay vector.** They are
instrumentation, not art: the one number a player must never look away from the
field to read. Pillar P4.

**`systems/particles.ts` — the particle field carries its own `Rng`.** Drawing
scatter from the simulation's stream would put every wave downstream of how many
sparks an explosion threw and destroy Phase 35's reproducibility.
`tests/particles.test.ts` states it as the property.

**`systems/particles.ts` — one burst per *evaluation*, not per conjunction.** Per
conjunction cost 881 particles/second against a budget of 400. An effect's cost
is its frequency, not its size. `art-style.md` §6 rule 8.

**`core/audioMix.ts` — the score brightens with intensity; it does not get
louder.** Raising the volume under a dense wave buries the cues the player is
supposed to react to.

**`core/audio.ts` — a music note does not count against the SFX voice ceiling.**
The score is not allowed to starve the cues, and it would, being continuous.

**`core/assetLoader.ts` — the clip fallback is two steps, and both matter.** A
state with no frames of its own falls back to `idle`, so a unit can be given an
attack animation without also needing a death one; `idle` with no frames of its
own falls back to the base sprite, so a unit needs no animation at all.

**`core/assetLoader.ts` — sprite keys are a static manifest, never a string
built at runtime.** `` `/assets/sprites/${key}.png` `` is invisible to Vite and
ships nothing. `art-style.md`.

**`content/palettes.ts` — a telegraph must never be mistaken for the Sun's own
gold.** Measured, not judged: `tests/palettes.test.ts` holds every field palette
to a distance floor under a simulation of each colour deficiency. The shipped
palette's percussive-gold/thermal-orange pair sits at 88, below that floor, and
is recorded rather than fixed — widening it is an art decision.

---

## 5. The bridge into Svelte

**`stores/game.svelte.ts` — the store is a projection and must not reach into
the simulation.** Anything the UI wants done is a *request* the session consumes
and clears: `requestedStage`, `manualRequested`. `architecture.md`, `ui-spec.md`
§3.

**`stores/game.svelte.ts` — `timeToNextConjunction` must never run per frame.**
It simulates the rings forward up to two minutes. It runs when
`sim.formationVersion` changes, and again once the predicted alignment has
passed.

**`ui/MainMenu.svelte` — the `untrack` on the `game.paused` read is
load-bearing.** An effect that both reads and writes `game.paused` re-runs on its
own write and Svelte stops it with `effect_update_depth_exceeded`. The only
thing that effect may depend on is `open`. Deleting the `untrack` looks like
tidying and breaks the pause menu.

**No component registers a window `keydown` handler.** `bootstrap.ts` routes
every key, including Escape, in the **capture** phase — it is the only place
that knows the stacking order. In the bubble phase the router arrives after a
dialog has closed itself and reopens the menu it just dismissed. `ui-spec.md`
§8, enforced by `tests/ui.test.ts`.

**Nothing under `ui/primitives/` imports `stores/`.** A primitive that reads the
game is a screen with fewer props. `ui-spec.md` §3, enforced by
`tests/ui.test.ts`.

---

## 6. Text

All of §1–§7 of `i18n.md`, which is the source of truth. The three that bite:

**A component reads the language through `stores/i18n.svelte.ts`, never through
`i18n/translate.ts`.** The store passes the locale as an argument so Svelte
tracks it; the bare functions read a module variable and render the right words
exactly once. Enforced by `tests/i18n.test.ts`.

**Nothing under `progression/` or `core/` may name anything.** Neither knows what
language is on screen, so a projection carrying copy makes the component that
renders it unable to translate. Enforced by `tests/i18n.test.ts`.

**`key` and `values` are reserved placeholder names.** `T.svelte` takes them as
its own props, so a `{key}` hole can never be filled by a snippet. Enforced.
