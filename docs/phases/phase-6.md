# Phase 6: Economy & Progression Design Document

**Stage 0 — Concept & Design Foundation**
Output: `docs/design/economy-spec.md`

## Checklist

- [x] Currencies defined: upgrade-tree resource, prestige resource, ally tokens
- [x] Upgrade-tree categories and rough tier counts (4 branches, ~72 nodes)
- [x] Prestige/reset formula — what resets, what persists, how returns scale
- [x] Balancing table as a real file — `docs/design/balancing.csv` (77 parameters
      with tuning ranges and owning phase)

## Decisions locked

- **Three currencies with non-overlapping sinks:** Filings (run, resets),
  Recollection (prestige, buys the tree), Keys (roster, first-clear only).
  Keys are deliberately unfarmable so roster unlocks stay authored.
- **Escapement Tree:** Winding / Bracing / Salvage / **Regulation**. Regulation
  buys *control* rather than numbers and Phase 34 must protect that identity.
- **Respec is free between runs.** Charging would punish the experimentation the
  game is built around.
- **A Rewind never resets content access** — only power within a run. Re-traversing
  cleared zones is the genre's main churn driver and is designed out.
- **Prestige unlocks only after the first boss**, so a new player meets one
  progression system at a time.
- **Offline can never reach parity with active play** — capped, diminishing, no
  conjunctions, no Keys. P1 says the machine runs without you, not as well.
- **HP scales faster than damage** (1.14 vs 1.09) so players hit a stall before a
  wall — the stall is the Rewind signal.
- **Seven balancing invariants** recorded for Phases 20 and 35 to verify.

## Ground truth

`balancing.csv` wins over prose when they disagree. It is the file edited during
tuning passes and the one `content/*.ts` is checked against.
