# Phase 3: Core Game Loop Definition

**Stage 0 — Concept & Design Foundation**
Output: `docs/design/game-loop.md`

## Checklist

- [x] Map the minute-to-minute loop (encounter → auto-combat → drops → upgrades)
- [x] Map the session-to-session loop (run → prestige/reset → permanent upgrades → harder run)
- [x] Define win/loss conditions per stage
- [x] Define the overall meta goal in the theme's own terms
- [x] Include a loop-flow diagram in mermaid, embedded in the md file

## Decisions locked

- **Wave = 20–40 s, stage = 5–8 waves (3–5 min).** A wave boundary is always a
  safe place to stop playing.
- **A run has no failure state.** Losing a stage costs time, never progress.
  The player alone decides when to Rewind.
- **The stall is the signal** to Rewind — not a timer, not a game-over.
- **Meta goal:** turn the Unnumbered Ring for the first time in living memory.
- Two mermaid diagrams included; both render on GitHub.
- Five loop health checks recorded, to be re-asked at Phases 10, 20 and 35.
