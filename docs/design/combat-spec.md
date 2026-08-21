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
3. **Doing nothing is viable.** A player who never clicks still clears stages.
   The Beat is a lever for someone who wants one, not a tax on everyone else.
   This is P1 held honestly — the machine really does run without you.
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

`threat = dps * (1 + 2 * (1 - normalizedDistanceToMainspring))` — a weak enemy
about to reach the centre outranks a strong one at the rim. Re-target only when
the current target dies, leaves range, or every `retargetInterval` (default 0.75 s).
Never re-target on the tick a unit is mid-swing.

### Range

Range is an **annular arc**, not a circle: a unit on ring 2 reaches
`±angularReach` degrees along its own ring, and `±radialReach` rings outward. This
is what makes ring assignment a real decision — a short-reach unit on ring 3 covers
a wider *arc length* than the same unit on ring 1, because the ring is bigger.

```
effectiveArcLength = angularReach * radius_r
```

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
`chargeInterval` (default 4 s). Firing costs one. A Chime at zero charge is silent.
This makes Chimes burst-y and positionally strategic rather than a constant
damage floor — and it is why they cannot simply replace Movements.

**Predictive targeting:** lead the target by `distance / projectileSpeed`, so
Chime shots connect on drifting enemies. Movements do not lead — they are melee or
short-range and it would not read.

## 5. Bullet-hell rules

### Patterns

Data-driven, defined in `systems/patterns.ts` as pure functions returning spawn
descriptors. Never hardcoded in enemy logic.

| Pattern | Shape | Counterplay |
|---------|-------|-------------|
| `spread` | *n* projectiles across an arc | Nudge out of the cone |
| `spiral` | Continuous stream, rotating emitter | Wait out the sweep |
| `aimed` | Direct at nearest Movement or the Mainspring | Break the sightline |
| `wall` | Line with one gap | Align the gap by nudging |
| `ring` | Full 360° expanding shell | Absorb with a defended ring |
| `converge` | From rim inward on all arcs | Ring 1 defence matters |

Each takes `{ count, speed, spread, rotationRate, telegraphMs }`.

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
