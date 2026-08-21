# Theme Revision: Clockwork Orrery → Solar System

> **Status: decided, deferred.** Agreed after the Phase 11 playtest. Nothing is
> implemented yet — this file is the specification, so the change can be carried
> out when the phase plan reaches it rather than re-decided from memory.
>
> When code and this file disagree, the code is simply not there yet.

## The decision

**Full reskin to a literal solar system, keeping the existing tone.**

The setting becomes the real thing rather than a machine modelling it: a Sun at
the centre, four planets in their orbits, and alien craft attacking the Sun.
Player-supplied pixel art replaces the placeholder primitives.

**What is kept:** the dry maintenance-log voice, the "ordinary people on shift"
framing, understated stakes, and technical vocabulary with plain-language
tooltips. See `narrative.md` §Tone — those three rules survive the reskin intact.

**What is dropped:** the clockwork premise, the horological vocabulary, and
entropy-as-antagonist.

### The trade, recorded honestly

PLAN.md's closing section names the setting as the one thing worth protecting
deliberately. "A machine that drives the heavens, attacked by entropy, kept by
bored technicians" is unusual; "aliens attack the sun" is not. This was raised
before the decision and the decision was made anyway — deliberately, with the
trade understood.

Keeping the tone is what preserves most of the distinctiveness. A solar-system
defence game written like a maintenance log is still not a common thing.

## What actually changes

### Structure: 3 rings → 4

Four planets means four orbits. The current three rings become four.

Only **five places** hardcode the ring count:

| File | What |
|------|------|
| `entities/types.ts` | `RingIndex = 0 \| 1 \| 2 \| 3` |
| `core/formation.ts` | `ring === 3` (outer-ring range bonus) |
| `core/formation.ts` | `ring < 3` (screened-slot check) |
| `systems/ai.ts` | `Math.min(3, …)` in radial reach |
| `systems/synergy.ts` | `(i + 1) as 1 \| 2 \| 3` cast |

Everything else already derives from the `RINGS` array in `content/field.ts`.

**Prep step (cheap, zero behaviour change):** make those five derive from
`RINGS.length` instead. After that, adding a fourth orbit is one array entry.
Worth doing before Stage 2 builds more on the ring model — see "Schedule".

### Conjunction gets *more* correct

The signature mechanic is already named **conjunction**, an astronomy term
borrowed for clockwork. With real planets it becomes literally accurate: bodies
aligning in their orbits. No mechanical change — the fiction just stops being a
metaphor.

Four rings also makes a **Grand** conjunction (4+ participants) reachable with
one unit per orbit, which it currently is not.

### Orbital periods

Real periods are 88 / 225 / 365 / 687 days — ratios of roughly 1 : 2.56 : 4.15 :
7.81. Those are naturally non-repeating, which satisfies the coprime constraint
from Phase 10 **for free** and is astronomically true.

The catch: at Mercury = 8 s, Mars would take ~62 s per revolution, which is
likely too slow to feel alive within a 20–40 s wave. Expect to compress the
outer periods and lose some astronomical accuracy. Settle this by feel during
implementation, and keep the coprime test passing either way.

### Vocabulary map

Names to be settled at implementation. Current thinking:

| Now | Becomes | Notes |
|-----|---------|-------|
| The Orrery | *(the system's name)* | Needs a name that is not "the solar system" |
| Mainspring | **the Sun** | Objective |
| Tension | *(core integrity / output)* | The Sun's health stat |
| Movement | *(orbital defence platform)* | Ring-slot unit |
| Chime | *(deep-space array / outer station)* | Static rim unit |
| Slack | *(alien craft)* | Enemy |
| The Unwinding | *(the fleet / the incursion)* | Enemy faction |
| Filings | *(salvage)* | Run currency |
| Recollection | **?** | Prestige currency — see below |
| Keys | *(clearance codes?)* | Roster tokens |
| The Escapement | *(the service / the watch)* | Player's order |
| Wright | *(technician / operator)* | The player |
| Rewinding | **?** | Prestige act — see below |

Planets are **Mercury, Venus, Earth, Mars** (the inner rocky planets).

> *To confirm:* the brief said "up to Venus" but also "4 planets" twice. Four is
> assumed, since it was stated twice and matches a natural grouping. Worth one
> question before implementing.

### The hard problem: prestige

**This is the weakest part of the reskin and needs a real answer before
Phase 26.**

"Rewinding the mainspring" worked because a mainspring literally winds back —
the reset *was* the lore, which is what stopped prestige reading as punishment
(pillar P5). A solar system has no equivalent gesture.

Candidate directions, none yet chosen:

1. **A time loop.** The system resets to an earlier orbital configuration; the
   operator remembers. Closest to the current fiction and preserves P5 exactly.
2. **Orbital realignment.** The planets are re-positioned for a fresh defensive
   cycle. Mechanically honest, emotionally flat.
3. **A new system entirely.** Each prestige moves to another star. Fits
   "further, not again" — but breaks the persistence of place.
4. **Simulation reset.** The whole thing is a training simulation being re-run.
   Cheap, and undercuts the stakes.

Whatever is chosen must satisfy P5: *a reset is not a defeat*, and the player
never loses access to content already unlocked (`economy-spec.md` §3).

## Schedule

The reskin is not one change; it lands across three points in the plan.

| When | What | Blocking? |
|------|------|-----------|
| **Before Stage 2 solidifies** | Prep step: make the ring count derive from `RINGS.length` | No behaviour change; cheap now, tedious later |
| **Phase 12** | Objective entity is expanded — good moment to rename Mainspring → Sun | Optional; can defer to 29 |
| **Phases 29–33** | Content production: rosters, enemies, bosses, zones. **All naming lands here** | The natural home |
| **Phase 26** | Prestige loop — the prestige fiction must be settled by now | Hard requirement |
| **Phase 37** | Art style guide and asset pipeline: `core/assetLoader.ts`, sprite manifest | **Pixel art needed here** |
| **Phase 38** | Sprites wired to entities by asset key | Uses Phase 37's pipeline |

## What is needed from the player, and when

**At Phase 37**, pixel art for:

- The **Sun** (objective, centre)
- **Four planets** — Mercury, Venus, Earth, Mars
- **Alien craft** — ideally 3+ visually distinct types, matching the tiering in
  `content/enemies.ts`
- **Projectiles** — bullets/lasers, for both alien fire and friendly fire

Useful to know when supplying them:

- **Power-of-two dimensions** where practical, for atlas packing.
- **Consistent pivot/centre** — entities are positioned by centre, not corner.
- **Separate files per entity**, named by a stable key; the manifest maps key →
  file, and `content/*.ts` references the key.
- **Animation frames**, if any, as separate files or a strip with fixed cell
  size. Phase 38 wants idle / attack / hit / death sets.
- **Silhouette matters more than detail** — pillar P4 requires readability at
  speed and density.

## Performance note

Moving from `Graphics` primitives to `Sprite`s is expected to be **faster**, not
slower. Phase 11 found per-entity `Graphics` geometry rebuilds were the entire
render bottleneck; sprites sharing a texture batch far better on the GPU. The
Phase 11 dirty-signature optimisation may become unnecessary once sprites land —
re-measure before removing it.

## Phases already written that this supersedes

`pillars.md`, `narrative.md`, `market-research.md`, `game-loop.md` and
`economy-spec.md` all describe the clockwork setting. When the reskin is carried
out:

- **`narrative.md`** is rewritten wholesale.
- **`pillars.md`** keeps all five pillars unchanged — they are mechanical, not
  thematic — and only the pitch and the setting-selection section change.
- The rest need vocabulary passes only.
- Phase checklists in `docs/phases/` keep their original text with a superseded
  note, as was done for the nudge → Beat revision.
