# Economy & Progression Specification

> Phase 6 output. Contract for `src/lib/progression/` and `content/upgrades.ts`.
> The numeric table lives in `balancing.csv` beside this file — that CSV is the
> ground truth for Phase 20 and Phase 35 tuning, not this prose.

## 1. Currencies

Three, with deliberately non-overlapping sources and sinks. If two currencies ever
buy the same thing, one of them is redundant.

| | **Filings** | **Recollection** | **Keys** |
|---|---|---|---|
| **Icon sense** | Brass swarf | A remembered alignment | A winding key |
| **Source** | Slack destroyed | Awarded on Rewinding | Stage and boss clears |
| **Scope** | Current run only | Permanent | Permanent |
| **Resets on Rewind** | **Yes, entirely** | No | No |
| **Spent on** | In-run slotting, reinforcements, repairs | The Escapement Tree | Unlocking and levelling Movements/Chimes |
| **Earned offline** | Yes, capped | No | No |
| **Analogue** | Run currency | Prestige currency | Roster tokens |

**Why Keys are separate from Recollection.** Recollection buys *stat depth* (the
tree); Keys buy *roster breadth*. Keeping them apart means a player cannot funnel
everything into one axis and trivialise the other — and it gives stage clears a
reward that a long idle session cannot substitute for. Keys are the one currency
that requires actually clearing content.

### Filings

```
drop = baseDrop_enemy * (1 + zoneIndex * 0.35) * (1 + treeBonus_filings)
```

Sinks, in the order the player meets them:

| Sink | Cost shape | Notes |
|------|-----------|-------|
| Slot a Movement | `50 * 1.18^(slotsUsed)` | The main early sink |
| Mount a Chime | `120 * 1.22^(mountsUsed)` | Deliberately pricier than a Movement |
| Emergency repair | `40 * 1.5^(repairsThisStage)` | Restores 25% Tension; escalates hard so it is a panic button, not a strategy |
| Reinforce a slot | `200 * 1.25^(reinforcements)` | +20% stats to one slot, expires at stage end |

Growth of 1.18 on the primary sink is the load-bearing number: it is shallow enough
that the tenth slot is reachable in a first run, steep enough that the twentieth
requires tree investment.

### Recollection

Awarded only on Rewinding:

```
recollection = floor( (deepestStageCleared ^ 1.6) / 8 * (1 + treeBonus_recollection) )
```

The 1.6 exponent means pushing two stages deeper is worth roughly 1.8× the
Recollection — enough to make depth strictly better than breadth, not so much that
an early Rewind is ever a mistake. Exponent lives in `balancing.csv`; expect it to
move during Phase 35.

**Zero-award guard:** a Rewind that would grant 0 Recollection is blocked in the UI
with a clear explanation of the threshold. Players must never be able to burn a run
for nothing.

### Keys

Flat, predictable, non-scaling:

| Source | Keys |
|--------|------|
| First clear of a normal stage | 1 |
| First clear of a boss stage | 5 |
| Re-clear of any stage | 0 |
| Zone fully cleared | 10 |

First-clear-only is intentional: Keys measure *how much content you have seen*, so
they cannot be farmed. This makes the roster unlock curve authored rather than
grindable, which Phase 29's roster balance depends on.

## 2. The Escapement Tree

Bought with Recollection. Persists through every Rewind. Four branches, and a node
requires all its declared prerequisites.

| Branch | Governs | Tiers | Nodes | Flavour voice |
|--------|---------|-------|-------|---------------|
| **Winding** (offence) | Attack, haste, crit, conjunction potency | 6 | ~22 | The Manual, terse |
| **Bracing** (defence) | Tension pool, Movement defence, block arc, recovery time | 6 | ~20 | The Undermaster |
| **Salvage** (economy) | Filing drops, offline rate and cap, repair costs | 5 | ~16 | Sabel Ock, sardonic |
| **Regulation** (utility) | Nudge cooldown, ring speed control, conjunction tolerance, preview quality | 5 | ~14 | The Manual's marginalia |

~72 nodes total. Node cost within a branch:

```
cost = baseCost_tier * 1.9^(nodesPurchasedInBranch)
```

**Regulation is the interesting branch.** It buys *control*, not numbers — a
shorter nudge cooldown, a wider conjunction tolerance, the ability to slow a ring.
It is the branch that changes how the game plays rather than how hard it hits, and
Phase 34 should protect that identity when filling out content.

**Respec:** allowed, free, only between runs. Charging for respec would punish
experimenting with formations, which is the game's main pleasure. The cost of a
wrong build is already the time spent on it.

## 3. The Rewind

### What resets

- Filings (to 0)
- Stage progress within the current run
- In-run reinforcements and repairs
- Slotted formation (roster is kept; the arrangement is cleared)

### What persists

- Recollection and the entire Escapement Tree
- Keys, unlocked Movements and Chimes, and their levels
- Achievements, settings, statistics
- Zone unlocks — **you never re-clear a zone to reach it again**

That last point matters. Re-traversing cleared content is the most common reason
players stop returning to a prestige loop. Here, a Rewind resets your *power within
a run*, not your *access to content*.

### When it becomes available

After the first boss clear (Hour Ring). Before that, the tree is hidden entirely —
a first-time player should meet exactly one progression system at a time.

### Expected cadence

| Rewind | Target run length | Deepest stage | Recollection |
|--------|-------------------|---------------|--------------|
| 1st | 25–40 min | ~8 | ~4 |
| 2nd | 20–30 min | ~14 | ~9 |
| 3rd | 15–25 min | ~22 | ~19 |
| 5th | 10–20 min | ~40 | ~63 |
| 10th | 10–15 min | ~75 | ~200 |

Runs get *shorter* and deeper. If Phase 35 playtests show run length climbing
instead, the tree is under-powered relative to the wave curve.

## 4. Offline progress

```
effectiveSeconds = min(elapsedSeconds, offlineCapSeconds)
rate             = filingsPerSecond_lastActive * offlineEfficiency
filings          = effectiveSeconds * rate * diminishing(effectiveSeconds)

diminishing(t)   = 1 / (1 + t / (4 * 3600))
```

| Parameter | Base | Max via Salvage branch |
|-----------|------|------------------------|
| `offlineCapSeconds` | 4 h | 24 h |
| `offlineEfficiency` | 0.40 | 0.75 |

**Never reaches parity with active play.** At maximum investment, eight offline
hours are worth roughly two active hours. Three deliberate gaps keep active play
dominant:

1. Conjunctions do not fire offline (they need real ring phase simulation).
2. No stage progress accrues — Keys are impossible to earn offline.
3. The diminishing curve halves the marginal rate every four hours.

This is P1 honoured precisely: the machine runs without you, but not as well.

The "welcome back" summary (Phase 27) reports elapsed time, Filings earned, and —
honestly — what was missed. Telling the player they lost nothing when they did is
the kind of thing that erodes trust in an idle game's numbers.

## 5. Wave scaling

```
enemyHp     = baseHp    * 1.14^stage * zoneMultiplier
enemyCount  = baseCount + floor(stage / 3)
enemyDamage = baseDamage * 1.09^stage * zoneMultiplier
```

HP scales faster than damage (1.14 vs 1.09) so the failure mode is *stages taking
too long* before it is *dying suddenly*. A player who has out-scaled their build
should feel a stall, not a wall — the stall is what tells them to Rewind
(`game-loop.md`, "The stall is the signal").

**Boss stages** at every 8th stage: 12× HP, 1.5× damage, multi-phase, unique
patterns. Bosses ignore the count formula.

**Endless scaling** past the authored zones: the same formulas continue with
`zoneMultiplier` fixed at the Unnumbered Ring's value, so there is no cliff at the
content boundary — just an unbroken curve.

## 6. Time-to-unlock targets

Design intent for a first-time player. Phase 35 validates against these.

| Milestone | Target elapsed | Guard |
|-----------|----------------|-------|
| First Movement slotted | 30 s | Must be near-immediate |
| Second Movement | 3 min | Introduces the cost curve |
| First Chime | 8 min | New system, after Movements are understood |
| First conjunction fires | 10 min | Should be a surprise, then explained |
| First boss reached | 20 min | |
| Tree revealed | 22 min | Immediately after first boss |
| First Rewind | 25–40 min | The session-one destination |
| Second zone | 45 min | Should land in session two |
| All six zones | 25–40 h | Full authored content |

One new system at a time, each roughly doubling the interval before the next. A
player who stops at 10 minutes should still have met a complete loop.

## 7. Balancing invariants

Properties that must hold after any tuning pass. Phase 20 and 35 check them; a
violated invariant is a balance bug regardless of how the numbers feel.

1. **No dominant unit.** No Movement or Chime appears in >60% of end-game
   formations in playtests.
2. **No dead node.** Every tree node is a defensible purchase at some point in some
   build. A node nobody buys is cut, not left in.
3. **Type multipliers stay in 0.75–1.5.** Widening the band collapses roster
   diversity (see `combat-spec.md` §7).
4. **Offline never beats active.** Best-case offline rate stays under 50% of
   active rate for equivalent wall-clock time.
5. **Rewinding always pays.** No point on the curve where continuing a run beats
   Rewinding and returning — that state is a trap and reads as a bug to players.
6. **Repair is a panic button.** Emergency repair never becomes a sustainable
   strategy; the 1.5 growth factor exists to guarantee this.
7. **Progress is monotonic.** A Rewind never reduces access to content already
   unlocked.

## 8. Numeric ground truth

All constants above are mirrored in [`balancing.csv`](./balancing.csv) with their
tuning ranges and which phase owns each. When code and this document disagree,
**the CSV wins** — it is the file that gets edited during tuning passes, and it is
what `content/*.ts` should be checked against.
