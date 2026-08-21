# Combat System Specification

> Phase 5 output. This file is the contract that `src/lib/systems/combat.ts`,
> `ai.ts`, `patterns.ts`, `collision.ts` and `synergy.ts` are implemented against
> in Stage 2. Numbers here are **starting values**, tuned in Phase 20 against
> `balancing.csv` — but the *rules* are settled.

## 1. The field

Polar, not cartesian. Every position in the simulation is `(ring, angle)`, and
cartesian coordinates exist only at render time.

```
                    rim (spawn boundary)
        ┌───────────────────────────────────────┐
        │        ╭───── Ring 3 ─────╮           │
        │      ╭──── Ring 2 ────╮   │           │
        │    ╭─── Ring 1 ───╮   │   │           │
        │    │   [Mainspring]│   │   │           │
        │    ╰──────────────╯   │   │           │
        │      ╰────────────────╯   │           │
        │        ╰──────────────────╯           │
        └───────────────────────────────────────┘
```

| Ring | Radius | Slots | Base period | Role |
|------|--------|-------|-------------|------|
| 0 | 0 | — | — | The Mainspring. The objective. |
| 1 | 90 px | 6 | 8 s / rev | Fast inner line. Last defence. |
| 2 | 160 px | 10 | 14 s / rev | Main line. |
| 3 | 240 px | 14 | 22 s / rev | Outer line. First contact. |
| Rim | 320 px | 8 mounts | static | **Chime** mounts. Do not rotate. |

Rings turn **clockwise** by default. Slots are evenly spaced; slot *k* on ring *r*
sits at angle `(k / slots_r) * 2π + ringPhase_r`.

`ringPhase_r` is the only per-ring mutable state, advanced each tick by
`2π / period_r * dt`. **This is the whole rotation system** — units do not store
angles, they store slot indices, and their angle is derived. That keeps rotation
O(rings) rather than O(units).

### Rings are not controllable

Ring rotation is **constant and automatic**. There is no input that steers it, at
any point in the progression, and no upgrade grants one.

> **Revised after the Phase 10 playtest.** The original design made a per-ring
> "nudge" the player's live input. In play it required tracking three
> independent cooldowns and reacting under time pressure — a dexterity test,
> which is precisely what pillar P3 forbids. The spec contradicted the pillar and
> the pillar was right. See `docs/phases/phase-10.md`.
>
> A second problem mattered as much: the nudge was **defensive**. Its purpose was
> to avoid damage, so using it badly was punished. An input whose failure mode is
> "you took a hit" generates pressure no amount of tuning removes.

### The Beat — the player's only live input

The Wright works the escapement by hand, releasing a measured beat of stored
tension as a strike anywhere on the floor.

| Property | Value |
|----------|-------|
| Aim | Click a point on the field |
| Delivery | **Instant.** No projectile, no travel time, no leading |
| Area | 44 px radius at the struck point |
| Damage type | Percussive |
| Resource | 3 Beats, one regenerating every 3 s |
| Cooldown | 0.25 s between strikes, to stop double-click waste |
| Cost | None beyond the resource. Never spends Tension. |

Four properties make this upside rather than pressure, and none of them are
negotiable in tuning:

1. **Instant delivery removes aiming skill entirely.** Nothing to lead, nothing
   to miss with. The decision is *when* and *where*, never *how precisely*.
2. **Failure is soft.** A badly spent Beat costs you damage you did not deal. It
   never costs Tension, never opens a gap, never punishes. Compare the nudge,
   where a mistimed input meant taking a hit.
3. **Doing nothing is viable.** The Beat is a lever for someone who wants one,
   not a tax on everyone else. This is P1 held honestly — the machine really does
   run without you.

   > **Partially unverified as of Phase 17.** Measured against the *starting*
   > formation, stage 1 clears without a single strike (0.73 Tension with a full
   > formation, 0.55 with four units), but stages 2 and 3 do not.
   >
   > The confound is that the formation is currently frozen at six units for
   > every stage, because there is no economy yet. A player reaching stage 3 in
   > the finished game will have bought more. **Phase 20 must re-verify this
   > property with a formation appropriate to each stage**, once Phases 21–24
   > make growth possible. If it still fails there, density comes down — the
   > property wins, not the tuning.
4. **Area damage keeps it satisfying off-type.** Percussive is unfavourable
   against `Massed`, the most common armour class. Without a blast radius the
   one manual action in the game would feel weakest against the enemies the
   player sees most, which would be a poor joke to build in deliberately.

## 2. Auto-battle rules

### Targeting

Each Movement re-evaluates on its own cadence, not every tick. Default policy per
archetype, overridable per-unit in `content/allies.ts`:

| Policy | Picks | Default for |
|--------|-------|-------------|
| `nearest` | Smallest angular+radial distance | Strikers |
| `lowestHp` | Lowest absolute HP in range | Finishers |
| `highestThreat` | Highest `threat` score in range | Anchors |
| `deepest` | Closest to the Mainspring | Guards |
| `none` | Does not attack; support/aura only | Regulators |

`threat = dps * threatWeight * (1 + 2 * (1 - normalizedDistanceToMainspring))` —
a weak enemy about to reach the centre outranks a strong one at the rim.
`threatWeight` is a per-Slack multiplier from `content/enemies.ts`, letting
content mark a type as disproportionately urgent without touching the formula. Re-target only when
the current target dies, leaves range, or every `retargetInterval` (default 0.75 s).
Never re-target on the tick a unit is mid-swing.

### Range

Range is an **annular arc**, not a circle: a unit on ring *r* reaches
`±angularReach` radians along its own ring, and `radialReach` rings **outward**.
This is what makes ring assignment a real decision — a short-reach unit on ring 3
covers a wider *arc length* than the same unit on ring 1, because the ring is
bigger.

```
effectiveArcLength = angularReach * radius_r
```

**The band is bounded inward as well as outward** (clarified in Phase 13):

```
innerBound = isInnermostRing ? 0 : radius_r - RADIAL_MARGIN
outerBound = radius_(r + radialReach) + RADIAL_MARGIN
```

with `RADIAL_MARGIN = 40 px`.

Two rules, and both matter:

1. **The innermost ring defends everything inside it.** Otherwise a Slack that
   reached the Mainspring would be unreachable by anything at all.
2. **Every other ring is bounded inward.** Without this, an outer unit could
   strike a Slack that had already penetrated to the centre, which would make
   ring assignment nearly meaningless and undercut pillar P2. Depth of
   penetration has to cost the defender something.

This was implemented without the inner bound in Phase 10 and corrected in
Phase 13.

### Attack timing

Cooldown-driven, not tick-driven:

```
interval = baseInterval / (1 + hasteBonus)
```

Each unit carries `cooldownRemaining`, decremented by `dt`. When it crosses zero
the unit attacks and resets. Attacks resolve **instantly for melee**, and spawn a
`Projectile` for ranged. No wind-up animation gates damage — animation is cosmetic
and reads from the same cooldown value.

### Formation bonuses

Applied on slot assignment and cached until the formation changes. Never
recomputed per tick.

| Condition | Bonus |
|-----------|-------|
| Ring 1 placement | +15% defence (close support from the Mainspring) |
| Ring 3 placement | +10% range (nothing blocking the sightline) |
| Both neighbours on the same ring filled | +10% attack |
| Slot directly radially outward is filled | +5% defence (screened) |
| Full ring (all slots occupied) | +8% attack to that entire ring |

## 3. Conjunction — the signature mechanic

Two or more Movements on **different rings** count as in conjunction when their
angles fall within `conjunctionTolerance` (default 6°) of each other.

Because rings turn at different, deliberately non-integer-ratio periods,
conjunctions occur on their own schedule. The player does not trigger them — they
*arrange for them*, then watch. This is P3 made mechanical.

### Rules

1. Evaluated every 100 ms, not every tick — a dedicated `synergy.ts` pass.
2. A conjunction of *n* units fires an effect scaled by *n*: 2 units = **Minor**,
   3 = **Major**, 4+ = **Grand**.
3. On firing, every participating unit gains a burst per its `conjunctionEffect`
   (from `content/allies.ts`): a damage pulse, a shield, a haste window, etc.
4. **Per-conjunction cooldown of 6 s**, keyed on the participating slot set — so a
   slow alignment that lingers does not machine-gun.
5. Type pairing modifies the effect. Matching types amplify; opposed types produce
   a distinct *interference* effect that is weaker but hits a wider arc.

### Preview requirement

`ui/FormationEditor.svelte` (Phase 18/24) must show **time-to-next-conjunction**
for the current arrangement. Planning is only meaningful if it is legible. This is
a hard requirement, not a nice-to-have — without it the mechanic is invisible.

## 4. Chimes — ranged support

Distinct from Movements in four ways that must survive balancing:

| | Movements | Chimes |
|---|-----------|--------|
| Position | Ring slots, **rotating** | Rim mounts, **static** |
| Range | Local arc | Whole field, any ring |
| Resource | None | **Charge**, regenerating |
| Conjunction | Participate | **Do not participate** |
| Targeting | Reactive | **Predictive** — leads moving targets |

Chimes do not rotate, so they are the player's stable reference frame while
everything else turns. They cover the arcs the rotation leaves briefly thin.

**Charge:** each Chime holds `maxCharge` (default 3), regenerating one per
`chargeInterval` (**6 s**). Firing costs one. A Chime at zero charge is silent.
This makes Chimes burst-y and positionally strategic rather than a constant
damage floor — and it is why they cannot simply replace Movements.

`chargeInterval` is **the balance lever between the two unit classes**, tuned in
Phase 14 by measuring the marginal value of ~120 Filings spent either way:

| `chargeInterval` | +1 Chime | +2 Movements | |
|---|---|---|---|
| 4 s | +0.49 Tension | +0.33 | Chime dominant |
| **6 s** | **+0.34** | **+0.33** | **balanced** |
| 7 s | +0.22 | +0.33 | Movements dominant |

At 6 s the Chime build clears *faster* while being equally robust — a genuine
trade rather than a strictly better option. Retune this before touching Chime
damage; damage barely moves the outcome, because clear time is floored by the
wave spawn schedule.

**Chimes cannot be damaged.** They sit on the rim, outside the field of fire:
Slack spawn at that radius and travel inward, and so do their projectiles. A
Chime's cost is that it contributes **no defence whatsoever** — it has no block
arc, so nothing it does slows a Slack down — and that its output is gated by
Charge. Measured consequence: **Chimes alone lose the stage.** Two Chimes and no
Movements managed 8 kills before Tension hit zero, because nothing was stopping
anything.

**Predictive targeting:** lead the target by `distance / projectileSpeed`, so
Chime shots connect on drifting enemies. Movements do not lead — they are melee or
short-range and it would not read.

## 5. Bullet-hell rules

### Patterns

Data-driven, defined in `systems/patterns.ts` as pure functions returning spawn
descriptors. Never hardcoded in enemy logic.

| Pattern | Shape | Counterplay |
|---------|-------|-------------|
| `spread` | *n* projectiles across an arc | Spread the formation; the cone covers one arc |
| `spiral` | Curving arms from a rotating emitter | Wait out the sweep; the gaps are wide |
| `aimed` | Direct at the target | Blocked by whatever is in the way |
| `wall` | Line across an arc with one gap | Put the gap over something that can take it, or break the wall with a Beat |
| `ring` | Full 360° expanding shell | Absorb with a defended ring |
| `converge` | Wedge closing from the rim | Ring 1 defence matters |

All six are implemented in Phase 16, each with exactly one user in
`content/enemies.ts` — an unused pattern is untested configuration.

> Counterplay was restated in Phase 16. The original table assumed the ring
> nudge, which no longer exists; see §1.

### Density and speed are a deliberate choice

**The tone is "readable pressure", not danmaku.** P4 makes legibility
non-negotiable, and the player's only input is a coarse area strike — there is
no precise dodge to reward, so dense fast curtains would punish without offering
counterplay.

- **Speeds sit at 85–155 px/s**, roughly half genre-typical. Rim to centre takes
  2–4 s, leaving time to read and act.
- **Counts stay in single digits per emission.** Pressure comes from several
  Slack on staggered cadences, not one wall of forty.
- **Telegraphs run 450–750 ms** and scale with how much ground a pattern denies.
  `converge` gets the longest.

Measured across zone 1: peak concurrent projectiles of 12 / 18 / 30 across the
three stages — **2–5% of the 600 budget**. That headroom is deliberate and is
for Phase 32 bosses, which are where density should spike.

**Open question for Phase 19/20:** 30 projectiles at peak may be *too* sparse to
read as bullet-hell at all. The scaling director will drive this up; whether the
result lands as pressure or as noise needs a playtest, not a measurement.

### Telegraph before threat — non-negotiable

Every pattern renders a telegraph for `telegraphMs` before the first projectile
spawns. Minimum **400 ms**, and boss patterns use 600–900 ms. A pattern that can
kill without warning is a bug, not a difficulty setting (P4).

### The Mainspring hitbox

- Radius **28 px** — visually smaller than the rendered Mainspring, which is
  generous to the player and standard practice for fairness.
- Projectiles reaching it deal damage to **Tension** and despawn.
- No invulnerability frames. Tension is a pool, not a life counter, so
  chip damage is the intended texture.

### Objective rules (Phase 12)

Implemented in `systems/objectiveRules.ts`, deliberately separate from the entity
so win and loss conditions are readable without reading a tick function.

**Regeneration is paused during a live wave.** It ticks only in `wave-gap`.
`game-loop.md` says damage carries into the next wave as reduced Tension, and
continuous regeneration would erode that — sustained pressure could be out-healed
rather than survived. Confining recovery to the gap keeps the carry-over
meaningful and makes the gap a real beat rather than dead time.

**Shields replace, they do not stack.** A stronger grant overwrites a weaker one;
a weaker grant only extends the existing duration. Stacking would let a player
bank conjunctions into an invulnerability window, which fights the no-wall
principle in `economy-spec.md` §5.

**Loss is checked before clear.** A Mainspring reaching zero on the same tick the
last Slack dies is a **loss**. Clearing a stage you did not survive would be
incoherent.

**Tension thresholds** at 50% / 25% / 10% fire an event when crossed *downward*
only. Regenerating back up through one is not an event, or a Mainspring hovering
at a threshold would spam them. These drive HUD warnings, achievements, and
later boss phase triggers.

**Threshold checks run late in the tick** — step 10, not step 2. Damage lands at
steps 6–8, so a check folded into the recovery step would compare a value to
itself and never fire. This was a real bug, caught by test.

**Emergency repair** restores 25% of maximum Tension at a cost escalating by
1.5× per use within a stage, and refuses at full Tension so nobody is charged for
nothing. The escalation is what keeps it a panic button rather than a strategy
(`economy-spec.md` invariant 6). The economy transaction itself lands in
Phase 21; Phase 12 exposes only the hook.

### Blocking

Movements have a **block arc** — a projectile crossing a Movement's slot within
`blockArc` degrees is absorbed, dealing damage to that Movement instead. This is
how the front line functions defensively without a separate mechanic, and it is
why a full ring is worth the formation bonus.

Blocked damage is reduced by the Movement's defence; overflow does **not** pass
through. A Movement at zero HP is disabled for `recoveryTime` (default 12 s), then
returns at full HP. Movements are never permanently lost — permadeath would fight
P5 and punish idle play.

## 6. Damage formula

```
raw        = attack * typeMultiplier * conjunctionMultiplier
mitigated  = raw * (100 / (100 + defence))
final      = mitigated * (1 + critBonus if crit)
```

Defence is **diminishing, never immunising** — the `100 / (100 + defence)` curve
means 100 defence halves damage, 300 quarters it, and nothing reaches zero. This
keeps late-game scaling from producing unkillable objects on either side.

Damage is applied as a float and only rounded for display. Rounding in the
simulation compounds badly across thousands of small hits.

## 7. Type interactions

Four ally types against four Slack armour classes.

| Ally type ↓ / Armour → | **Massed** | **Rigid** | **Seized** | **Erratic** |
|---|---|---|---|---|
| **Shear** | ×1.5 | ×0.75 | ×1.0 | ×1.0 |
| **Percussive** | ×0.75 | ×1.5 | ×1.0 | ×1.0 |
| **Thermal** | ×1.0 | ×1.0 | ×1.5 | ×0.75 |
| **Resonant** | ×1.0 | ×1.0 | ×0.75 | ×1.5 |

Two independent pairs (Shear↔Percussive, Thermal↔Resonant) rather than a single
four-way cycle. A four-way cycle would force one correct answer per wave; two pairs
mean most waves have two workable builds, which is the amount of freedom the
formation puzzle needs.

Multipliers stay in the 0.75–1.5 band. Wider bands make off-type units feel useless
and collapse roster diversity — the exact thing Phase 35 has to prevent.

Every armour class has **exactly one** favourable and one unfavourable counter,
and every damage type has exactly one of each. Enforced by
`tests/damageTypes.test.ts` -- an earlier draft of this table left `Seized` with
no weakness and gave `Rigid` two, which the test caught.

**Chimes are always Resonant.** This is why they are strong against `Erratic`
(fast, hard-to-hit Slack) and weak against `Seized` (slow, armoured Slack) --
a clean role split, since grinding down armoured targets is the front line's
job, not the rim's.

## 8. Simulation order

Fixed per tick. Order matters and must not drift:

1. Advance `ringPhase` for each ring.
2. Advance cooldowns and Chime charge.
3. Spawn scheduled enemies (`spawn.ts`).
4. Enemy movement and pattern emission (`patterns.ts`).
5. Movement + Chime targeting and attacks (`ai.ts`).
6. Projectile integration (`Projectile.ts`).
7. Collision resolution (`collision.ts`).
8. Damage application and death handling (`combat.ts`).
9. Conjunction evaluation — every 100 ms, not every tick (`synergy.ts`).
10. Win/loss condition check (`objectiveRules.ts`).
11. Publish the reactive projection to `stores/`.

Step 11 is the **only** point at which the simulation touches Svelte. Everything
above it is plain TypeScript with no framework imports — the boundary CLAUDE.md
requires.

## 9. Open questions for Phase 10

To answer with the vertical slice, not from the armchair:

1. Is a 6° conjunction tolerance perceptible, or does it fire faster than it reads?
2. ~~Is a 2.5 s nudge cooldown per ring engaging or fidgety?~~ **Answered in
   Phase 10: fidgety, and a P3 violation. The nudge is removed; see §1.**
3. Do rotating defenders read clearly at 200+ on-screen projectiles?
4. Does the block-arc mechanic communicate itself without a tutorial?
5. Are three rings the right number, or does the third add work without depth?
