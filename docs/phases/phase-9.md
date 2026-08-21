# Phase 9: Save & Persistence Architecture

**Stage 1 — Technical Foundation**
Output: `core/storage.ts`, `core/saveSchema.ts`, `core/saveMigrations.ts`,
`core/save.ts`, `core/autosave.ts`, `utils/encoding.ts`, `utils/hash.ts`

## Checklist

- [x] Save schema as a TypeScript interface covering resources, upgrade-tree
      state, unlocked roster, achievements and settings
- [x] `schemaVersion` versioned from day one
- [x] Migration machinery built before it is needed
- [x] Autosave on an interval
- [x] Autosave on key events
- [x] Offline-time tracking — timestamp diff on load
- [x] Corruption-safe writes — temp key, validate, swap, plus a last-known-good
      backup key
- [x] `localStorage` as the backend
- [x] ADR-002's five requirements, all discharged (see below)

## ADR-002 requirements, discharged

| # | Requirement | Where |
|---|-------------|-------|
| 1 | `schemaVersion` from the first write | `saveSchema.ts`, stamped by `SaveManager.save` |
| 2 | Corruption-safe writes | `save.ts` — temp → read-back → promote to backup → swap |
| 3 | Export/import save string | `save.ts` — `ORRERY-<schema>-<checksum>-<base64>` |
| 4 | Timestamp every save | `savedAt`, read by `load()` into `offlineSeconds` |
| 5 | Quota failures must not break the tick loop | `save()` returns false, never throws; autosave backs off |

## Decisions locked

### Run/meta split mirrors the Rewind

`SaveData` splits into `run` (discarded on Rewinding) and `meta` (survives).
This makes prestige a field swap rather than a field-by-field audit, and means a
new persistent value cannot be reset by accident — the failure mode that would
silently eat a player's progress.

`resetRun()` is the only place prestige touches the save, and it is tested
against the anti-churn guarantee: **a Rewind never resets content access.**
`unlockedZones` and `clearedStages` survive.

### Validation repairs rather than rejects

A save missing a field added in a later build loads with that field defaulted,
and the repair is reported in `notices`. Only structural nonsense fails — not an
object, or an invalid `schemaVersion`.

The reasoning: a player's 25–40 hours matter more than schema purity. The one
case that *does* refuse outright is a save from a **newer** schema, where loading
would silently discard fields this build does not know about.

### Injectable storage backend

`StorageBackend` exists for two reasons: ADR-002's IndexedDB migration path
needs callers not to know the backend, and the save layer has to be testable
without a DOM. Private browsing falls back to `MemoryStorage`, so the game runs
(non-persistently) rather than crashing — the export string is that player's
route to keeping progress.

### Autosave is DOM-free

No timers and no `beforeunload` inside `autosave.ts`. The game loop drives
`tick(dt)`; the app layer wires browser events to `flush()`. This keeps save
timing tied to simulation time rather than wall-clock timers that keep firing
while a tab is frozen, and keeps the module testable in plain Node.

Critical events (`stage-clear`, `rewind`, `manual`, `shutdown`) write
immediately. Routine ones (`purchase`) coalesce behind a 2 s minimum gap, so a
burst of purchases produces one write. Failures back off exponentially to a
5-minute ceiling, so a full quota is not hammered but is still retried.

## Measured

Save sizes, taken in Chrome through the real localStorage backend using a save
representing a completed game (all 72 tree nodes, 16 Movements and 6 Chimes at
level 25, 40 achievements, 6 zones × 10 cleared stages, full formation and mounts):

| | Size |
|---|---|
| Default (new game) | 733 bytes |
| Completed game | 6,914 chars (**13.8 kB** UTF-16) |
| With backup key | **27.7 kB** |
| Share of a 5 MB quota | **0.53%** |
| Export string | 9,238 chars |

ADR-002's 5–20 kB estimate held. localStorage is the right call by two orders of
magnitude.

**Flagged forward:** a ~9 kB base64 export string is a long paste. The checksum
catches truncation, but only after the player has lost the copy. If Phase 43
finds this awkward, deflating before base64 would cut it substantially — the
format is versioned, so that is additive.

## Verified in a real browser

Unit tests use `MemoryStorage`, so the production path was exercised separately
in Chrome: `LocalStorageBackend` selected, fresh → live transition, data actually
present under `orrery:save`, temp key cleaned up, non-ASCII content surviving a
round trip, export/import working, and a truncated string rejected.

## Test coverage

91 tests passing; 60 added this phase.

| File | Covers |
|------|--------|
| `tests/save.test.ts` | Round trip, offline tracking, corruption fallback, export/import, validation/repair, `resetRun` |
| `tests/autosave.test.ts` | Interval, key events, coalescing, failure backoff, recovery, snapshot timing |
| `tests/saveMigrations.test.ts` | Chain ordering, missing-step detection, non-advancing guard |
| `tests/encoding.test.ts` | Base64 round trips including >32 kB and non-ASCII, checksum properties |

Corruption safety is tested with deliberately hostile backends — one that
accepts the temp write and refuses the live one (the shape of a mid-sequence
quota failure), and one that silently truncates. Both leave the previous live
save intact.

## Carried forward

| Phase | Depends on this |
|-------|-----------------|
| 10 | Wires `Autosaver.tick(dt)` into the loop and `flush('shutdown')` to `beforeunload`/`visibilitychange` |
| 21–26 | Populate `run` and `meta`; call `request('purchase')` and `request('rewind')` |
| 27 | Reads `LoadResult.offlineSeconds` |
| 28 | Writes into `meta.achievements` |
| 42 | Surfaces `SaveManager.writeFailing` and `Autosaver.degraded` as a warning |
| 43 | Settings UI over `SaveData.settings`; export/import UI |
