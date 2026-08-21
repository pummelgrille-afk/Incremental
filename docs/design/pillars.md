# Core Pillars & Theme

> Phase 1 output. This file is the source of truth for the game's identity.
> Later phases read from it rather than re-deciding.

> **A theme revision is pending.** This document describes the clockwork Orrery
> setting. A decided-but-deferred reskin to a literal solar system supersedes
> parts of it — see [`theme-revision.md`](./theme-revision.md). Nothing here is
> implemented differently yet.

## 1. The pitch — mechanics first

A defence-shaped incremental where **the machine fights for you and your craft is
arrangement, not aim.**

You maintain a great mechanism. Waves of entropy-creatures close on its heart from
every direction, filling the field with projectiles. You never control a character
and never fire a shot. Instead you:

- **Place** wound automata into slots on concentric rotating rings (deck-building
  and formation).
- **Mount** longer-ranged support units on the outer rim, covering the arcs your
  front line cannot (ranged support).
- **Strike** with the Beat — the one live input — releasing stored tension
  instantly at a point on the floor. Optional: it adds damage when used and
  costs nothing when ignored.
- **Spend** what the wreckage drops on permanent upgrades, then reset the machine
  and go again, further (idle progression + permanent upgrades).

The mechanical bet: in a genre where auto-battlers ask you to arrange a *static*
board, this board **turns**. A formation is a pattern over time, not a layout.

## 2. Setting brainstorm

Eight candidates, each stress-tested against what the mechanics actually need — a
central objective with a health pool, a formation surface, readable projectile
patterns, and a reset that makes narrative sense.

| # | Setting | Objective | Formation surface | Reset fiction | Verdict |
|---|---------|-----------|-------------------|---------------|---------|
| 1 | **The Orrery** — a clockwork cosmos that *drives* the real sky | The Mainspring | Concentric gear-rings that rotate | Rewind the mainspring | **Chosen** |
| 2 | **The Hollow Bell** — a bell rung to hold back silence | The Bell | Scaffold tiers around the bell | Recast in a hotter fire | Strong; rings-as-sound overlaps #1 |
| 3 | **The Abyssal Vent** — a thermal vent colony against the cold dark | The Vent | Rock shelves | The vent erupts anew | Best contrast; weakest formation logic |
| 4 | **The World-Loom** — weavers holding reality's pattern | The Warp Beam | The warp grid | Cut the cloth, re-warp | Elegant but visually abstract |
| 5 | **The Seed Vault** — last botanical archive against blight | The Vault Heart | Terraced beds | Replant from stored seed | Pleasant, low tension |
| 6 | **The Salt Line** — a town's warding circle against the moor | The Hearth | The circle's arc | Re-lay the salt | Good tone, thin mechanics |
| 7 | **The Rookery** — beacon-birds guarding a signal fire | The Fire | Perches and towers | Relight from an ember | Charming, overlaps #6 |
| 8 | **The Dirigible** — sky-whalers defending an envelope | The Envelope | Gondola rigging | Re-inflate at port | Fun, objective too fragile-feeling |

## 3. The choice: **The Orrery**

The Orrery is a machine the size of a city, built in an age no one now remembers.
It is not a model of the heavens. It is their **cause**. Its rings turn, and the
real spheres turn with them. Let it stop and the sky stops.

It won the comparison on four mechanical counts:

1. **The formation surface is already in motion.** Concentric gear-rings rotating
   at different rates give positional dynamism for free — no player micromanagement
   and no artificial "units shuffle around" justification.
2. **Spiral and orbital bullet patterns are native to the fiction.** The hardest
   patterns to justify elsewhere are the obvious ones here.
3. **Conjunction is a synergy mechanic no other candidate offered.** When two units
   on different rings align radially — as planets fall into conjunction — the
   alignment fires. Power comes from arrangements you set up in advance and then
   *watch* pay off. See `combat-spec.md`.
4. **Prestige is diegetic.** Rewinding the mainspring literally resets the
   machine's time while the Wright keeps their memory. A reset stops reading as
   punishment, which is the usual failure mode of this genre's reset loop.

### Names locked in this phase

| Thing | Name | Notes |
|-------|------|-------|
| The machine | **the Orrery** | |
| The defended objective | **the Mainspring** | Health stat is **Tension** |
| The player's order | **the Escapement** | The player is a **Wright** |
| Front-line allies | **Movements** | Wound automata, named for clock parts |
| Ranged support units | **Chimes** | Mounted on the outer rim |
| The enemy force | **the Unwinding** | Its creatures are **Slack** |
| The prestige act | **the Rewinding** | |

Nomenclature draws on real horological vocabulary — *escapement, detent, fusee,
remontoire, verge, foliot* — which reads as invented but is public technical
language, giving the world a specific texture without borrowing from any game.

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
The single live input (the Beat) is instant and area-based, so there is no
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
patterns resolve but bounce off the execution demands of the genre. The Beat is
deliberately sized for them: instant, area-based, and entirely optional.

**Session shape.** 10–30 minutes of active arrangement per sitting, with meaningful
offline accrual between sittings. Never require a session longer than one run.

**Input.** Mouse primary; full keyboard parity required by Phase 43. No input that
demands precision timing finer than ~250 ms.
