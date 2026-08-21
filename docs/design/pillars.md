# Core Pillars & Theme

> Phase 1 output. This file is the source of truth for the game's identity.
> Later phases read from it rather than re-deciding.

> **The theme revision landed in Phase 29.** This file originally described a
> clockwork orrery. The setting is now a literal solar system — see
> [`theme-revision.md`](./theme-revision.md) for the specification and the
> record of what was traded away. All five pillars in §4 survived the reskin
> **unchanged**: they are mechanical, not thematic. Only the pitch (§1) and the
> setting choice (§3) were rewritten.

## 1. The pitch — mechanics first

A defence-shaped incremental where **the machine fights for you and your craft is
arrangement, not aim.**

You keep a watch station in the inner system. Waves of alien craft come down the
Sun's gravity well from every direction, filling the field with fire. You never
control a character and never take a shot yourself. Instead you:

- **Site** defence platforms in slots on four planetary orbits (deck-building and
  formation).
- **Mount** longer-ranged arrays on the static outer rim, covering the arcs your
  front line cannot (ranged support).
- **Strike** with the Flare — the one live input — releasing stored solar output
  instantly at a point on the field. Optional: it adds damage when used and
  costs nothing when ignored.
- **Spend** the salvage on permanent upgrades, then rewind the orbits and go
  again, further (idle progression + permanent upgrades).

The mechanical bet: in a genre where auto-battlers ask you to arrange a *static*
board, this board **turns**. A formation is a pattern over time, not a layout.

## 2. Setting brainstorm

Eight candidates, each stress-tested against what the mechanics actually need — a
central objective with a health pool, a formation surface, readable projectile
patterns, and a reset that makes narrative sense.

| # | Setting | Objective | Formation surface | Reset fiction | Verdict |
|---|---------|-----------|-------------------|---------------|---------|
| 1 | **The Orrery** — a clockwork cosmos that *drives* the real sky | The Mainspring | Concentric gear-rings that rotate | Rewind the mainspring | **Chosen, then reskinned — see §3.1** |
| 2 | **The Hollow Bell** — a bell rung to hold back silence | The Bell | Scaffold tiers around the bell | Recast in a hotter fire | Strong; rings-as-sound overlaps #1 |
| 3 | **The Abyssal Vent** — a thermal vent colony against the cold dark | The Vent | Rock shelves | The vent erupts anew | Best contrast; weakest formation logic |
| 4 | **The World-Loom** — weavers holding reality's pattern | The Warp Beam | The warp grid | Cut the cloth, re-warp | Elegant but visually abstract |
| 5 | **The Seed Vault** — last botanical archive against blight | The Vault Heart | Terraced beds | Replant from stored seed | Pleasant, low output |
| 6 | **The Salt Line** — a town's warding circle against the moor | The Hearth | The circle's arc | Re-lay the salt | Good tone, thin mechanics |
| 7 | **The Rookery** — beacon-birds guarding a signal fire | The Fire | Perches and towers | Relight from an ember | Charming, overlaps #6 |
| 8 | **The Dirigible** — sky-whalers defending an envelope | The Envelope | Gondola rigging | Re-inflate at port | Fun, objective too fragile-feeling |

## 3. The choice: **The Perihelion**

> Phase 1 chose candidate 1, the clockwork Orrery. Phase 29 kept every
> mechanical reason below and replaced the fiction wrapped around them: the
> machine that modelled the heavens became the heavens. See §3.1.

The Perihelion is a watch station in the inner system, holding four orbits
against craft that fall down the Sun's well. Nobody stationed there is a chosen
one. They are on shift.

The setting won the comparison on four mechanical counts, and **all four are
about the rings, not about the clockwork** — which is exactly why the reskin was
survivable:

1. **The formation surface is already in motion.** Concentric gear-rings rotating
   at different rates give positional dynamism for free — no player micromanagement
   and no artificial "units shuffle around" justification.
2. **Spiral and orbital bullet patterns are native to the fiction.** The hardest
   patterns to justify elsewhere are the obvious ones here.
3. **Conjunction is a synergy mechanic no other candidate offered.** When two
   units on different orbits align radially — as planets fall into conjunction —
   the alignment fires. Power comes from arrangements you set up in advance and
   then *watch* pay off. See `combat-spec.md`. The reskin made this one
   *literal*: it was an astronomy term borrowed for clockwork, and it now simply
   means what it says.
4. **Prestige is diegetic.** The Rewind returns the orbits to an earlier filed
   configuration; the Operator remembers the last cycle and the system does not.
   A reset stops reading as punishment, which is the usual failure mode of this
   genre's reset loop.

### 3.1 What the reskin cost, recorded honestly

PLAN.md named the setting as the one thing worth protecting deliberately. "A
machine that drives the heavens, attacked by entropy, kept by bored technicians"
is unusual; "aliens attack the sun" is not. That was raised before the decision
and the decision was made anyway, with the trade understood.

What preserves the distinctiveness is the **tone**, which did not change: a
solar-system defence game written like a maintenance log is still not a common
thing. narrative.md's three rules — understate the stakes, technical vocabulary
with plain meaning, no prophecy and no villain with a plan — survived intact.

### Names locked in Phase 29

| Thing | Name | Was | Notes |
|-------|------|-----|-------|
| The station | **the Perihelion** | the Orrery | The point of closest approach |
| The defended objective | **the Sun** | the Mainspring | Health stat is **Output** |
| The player's order | **the Service** | the Escapement | The player is an **Operator** |
| Front-line allies | **Platforms** | Movements | Sited in orbital slots |
| Ranged support units | **Arrays** | Chimes | Mounted on the static rim |
| The enemy force | **the Approach** | the Unwinding | Its craft are **Contacts** |
| The manual strike | **the Flare** | the Beat | The only live input |
| Run currency | **Salvage** | Filings | |
| Roster tokens | **Clearance** | Keys | First-clear only |
| Prestige currency | **Recollection** | *(unchanged)* | The Operator remembers |
| The prestige act | **the Rewind** | *(unchanged)* | The orbits return; you do not |
| The upgrade tree | **the Almanac** | the Escapement Tree | |

Nomenclature is the register of a **log room** — *contact, picket, clearance,
station, baseline, aperture* — real radar, observatory and duty-roster
vocabulary. It reads as specific without being invented, and every term has a
plain meaning available underneath it, which is narrative.md's second rule.

Two names needed no change at all. **Rewind** and **Recollection** were the
hardest part of the reskin to solve: theme-revision.md called prestige "the
weakest part" of it, because a mainspring literally winds back and a solar
system has no equivalent gesture. Choosing a **time loop** as the prestige
fiction resolved it. The orbits return to a filed configuration and the operator
carries the memory forward, so both words kept their literal sense and Phase
26's code and copy survived the reskin untouched.

## 4. Design pillars

**P1 — The machine runs without you.**
Auto-battle is the intended state, not a concession to idleness. A player who
walks away should return to progress, not wreckage. Every feature is judged by
whether it survives the player not watching.

**P2 — Position is a function of time.**
The rings turn. The same arrangement means different things at different moments,
so a formation is a *pattern over time*. Any feature that would work identically
on a static grid is not pulling its weight.

**P3 — Reward the plan, not the reflex.**
Conjunction, ring phasing, and pattern timing pay off arrangements made in advance.
The single live input (the Flare) is instant and area-based, so there is no
aiming skill and nothing to miss with — never a dexterity test. Its failure mode
is *damage not dealt*, never *damage taken*, which is what keeps it a lever
rather than a tax. This keeps the game playable one-handed and accessible.

*Revised after the Phase 10 playtest: the original live input was a per-ring
"nudge" that required tracking three cooldowns and reacting under pressure. It
violated this pillar. Rings are now permanently automatic — see combat-spec.md
§1.*

**P4 — Legibility over spectacle.**
Hundreds of projectiles must stay readable. Brass and warm light on a dark field,
silhouette before detail, telegraph before threat. When spectacle and readability
conflict, readability wins — every time. This constrains Phases 16, 37, 39 and 40.

**P5 — A reset is a rewind, not a defeat.**
The player loses no memory when the machine does. Progression language is always
"further", never "again".

## 5. Audience & platform

**Platform: browser/web.** The repo is Vite + TypeScript + Svelte 5 and targets a
modern desktop browser (Chrome, Firefox, Safari) at 60 fps. Deployment is static
hosting — see Phase 47. A Tauri/Electron storefront wrap is explicitly *out of
scope* unless flagged later; that decision affects Phases 7, 28 and 47.

**Primary audience.** Players of idle and incremental games who want more decision
surface than a click-and-wait, and auto-battler players who want a run to keep
paying out while they are elsewhere. Comfortable with numbers going up and with
reading a tooltip.

**Secondary audience.** Bullet-hell spectators — people who enjoy watching dense
patterns resolve but bounce off the execution demands of the genre. The Flare is
deliberately sized for them: instant, area-based, and entirely optional.

**Session shape.** 10–30 minutes of active arrangement per sitting, with meaningful
offline accrual between sittings. Never require a session longer than one run.

**Input.** Mouse primary; full keyboard parity required by Phase 43. No input that
demands precision timing finer than ~250 ms.
