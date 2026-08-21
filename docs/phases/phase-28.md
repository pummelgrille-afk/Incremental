# Phase 28: Achievements System

**Stage 3 — Progression Systems** (final phase)
Output: `entities/Achievement.ts`, `content/achievements.ts`,
`progression/achievements.ts`, `ui/AchievementToast.svelte`, save schema 5,
`tests/achievements.test.ts`

## Checklist

- [x] Achievement list and triggers, sized to the content that exists
- [x] Tracked locally in the save file — no platform API
- [x] Announced in play

## The names were already written

All seven are authored in narrative.md's "Achievement names" table, in the
Manual's register — dry, procedural, occasionally rueful. `content/
achievements.ts` **transcribes** that table and attaches a trigger; the copy
belongs to the design doc.

A test asserts the seven names match, in order. If they drift, the doc has
stopped being the source of truth it claims to be.

Sized to what exists. An achievement for content nobody can reach yet — a boss,
a second zone — would be a permanently grey row, so Phases 33 and 36 own those.

## Two of the seven needed a reading

narrative.md gives names and one-line intents, not predicates. Two were
genuinely ambiguous and the interpretation is recorded beside each:

**"Documented Procedure — clear a zone using only Movements from the Manual's
roster."** Read as: the front line alone, no support. And checked against the
**whole run**, not the zone, because a per-zone check is gameable — unmount the
Chime before the final clear and collect it on a technicality. An achievement
that rewards a technicality is worse than one that asks for a little more.

**"The Undermaster Will Hear of This — lose a stage with a full roster
slotted."** Read as every Movement you *own*, not every slot on every ring.
Thirty slots is unreachable for most of the game, and the joke lands better when
the player plainly had everything available and still lost. Guarded so an empty
roster does not trivially satisfy "all of it fielded".

## Moments, not frames

Triggers are evaluated on a stage clearing, a stage being lost, a conjunction
firing, a Rewind, and once on load — not per tick. Running seven predicates
sixty times a second to answer questions that change a handful of times a run
would be waste, and the *event* is what several of them are actually about.

That split is why the context mixes save state with a snapshot of the moment: "has
cleared a stage" is state, "a conjunction of three just fired" is not, and a
trigger that could only see the save could not express the second kind.

`largestConjunction` was added to `TickEvents` for exactly one of them —
`conjunctionsFired` counts events and cannot tell a pair from a triple. Merged
with `max`, not `+`.

**Evaluating on load matters.** State-shaped triggers would otherwise never fire
for a save that already qualified before this phase existed.

## Awarding is idempotent, and one bad predicate cannot end a run

`evaluate` skips anything already earned, so it is safe to call on every stage
clear forever. It returns only what was *newly* awarded, which is what the toast
announces.

A trigger that throws is treated as not-yet-earned rather than propagating.
Content is data; one bad predicate must not take a session with it.

## The toast queues rather than replaces

Several can land on the same tick — a first clear that was also untouched awards
two — and a toast that replaced its predecessor would silently swallow one. So
the store holds a queue and the component drains it one at a time.

A corner toast, not a modal: an achievement is a remark, not an interruption,
and stopping the field to acknowledge one would be the opposite of P1. It is a
real `<button>` inside a `role="status"` live region, so dismissal has keyboard
and focus handling for free and a screen reader announces it.

## Two bugs found while verifying

**The renderer's teardown was not idempotent.** Pixi's `Application.destroy`
throws on a second call — *"this._cancelResize is not a function"* — and Svelte
can unmount after an explicit teardown. A teardown path that throws on its
second call takes the error handler with it. Guarded.

**My own verification was wrong three times before it was right.** Clearing
`localStorage` and reloading does not produce a fresh save: the old page's
autosave flushes on unload and overwrites it. Every "fresh" run I measured
already had the achievements, so nothing new was awarded and no toast appeared —
which looked exactly like a broken toast. Fixing the teardown gave a way to stop
the app first, and the toast rendered on the first genuinely clean run.

Worth recording because it is the third time this session that the autosaver has
silently invalidated a browser measurement.

## Verified in the browser

From a genuinely empty save: played through, and the toast appeared reading
**"NOTED — Noted in the Log — Arrange a conjunction."** as a `BUTTON` inside a
`role=status` region. Awards persisted to `meta.achievements`, and the queue
advanced — the first drained before the second was earned.

## Test coverage

683 tests passing; 28 added — the transcribed names in order, no duplicate ids,
nothing earned on a fresh save, idempotent awarding, several at once, a throwing
trigger surviving, each of the seven triggers in both directions including the
two gameable readings, load-time catch-up awarding state-shaped triggers but not
event-shaped ones, the listing counting against content rather than the save
array, and the schema-5 migration.

## Stage 3 complete

Phases 21–28 are done. The progression systems are feature-complete against
economy-spec.md: three currencies, the Escapement Tree and its view, the roster
with levelling and loadouts, Chime upgrade tracks, the Rewind, offline progress
and achievements.

## Carried forward

| Phase | Item |
|-------|------|
| 33 | Zone-shaped achievements once there is more than one zone |
| 36 | The polish pass owns a browsable achievement list; `achievementList` is ready |
| 42 | The toast is bottom-right; the real shell may want it elsewhere |
| 47 | Storefront hooks, if a wrapper ever happens — nothing here reaches outside the save |
