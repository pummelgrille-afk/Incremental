# Theme Revision: Clockwork Orrery → Solar System

> **Status: carried out in Phase 29.** Agreed after the Phase 11 playtest,
> specified here, and implemented eighteen phases later without being
> re-decided from memory — which is what this file was for.
>
> Everything below is kept as written, including the parts that turned out to be
> wrong, with the outcome recorded beside them. Where this file and the code now
> disagree, **the code is right** and the note says why.

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

> **Done.** Ring 4: radius 310, 18 slots, period 34 s. All five hardcodes below
> now read `INNERMOST_RING` / `OUTERMOST_RING`, derived from `RINGS`. A **sixth**
> site this list missed was `ui/FormationEditor.svelte`, which kept its own
> radius table `{ 1: 78, 2: 132, 3: 186 }` with no entry for a fourth ring —
> every slot on it would have been positioned at `NaN`. It now scales the
> field's own radii.

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

> **Done, and measured — the claim was true but thinner than it sounds.**
> Same-ring units are excluded from conjunction by design, so with three orbits
> four participants was *arithmetically impossible*, not merely rare. With four
> it is possible. Measured over two simulated hours with one platform per orbit:
> **~3 Grands at base tolerance, ~10 with the Regulation branch invested.** So a
> Grand is roughly a once-every-forty-minutes event, and Regulation more than
> triples that — which hands that branch a headline effect it did not have.

### Orbital periods

Real periods are 88 / 225 / 365 / 687 days — ratios of roughly 1 : 2.56 : 4.15 :
7.81. Those are naturally non-repeating, which satisfies the coprime constraint
from Phase 10 **for free** and is astronomically true.

The catch: at Mercury = 8 s, Mars would take ~62 s per revolution, which is
likely too slow to feel alive within a 20–40 s wave. Expect to compress the
outer periods and lose some astronomical accuracy. Settle this by feel during
implementation, and keep the coprime test passing either way.

> **Done, and this prediction was exactly right.** Mars is 34 s, not 62. Periods
> are 8 : 14 : 22 : 34 = 4 : 7 : 11 : 17, pairwise coprime. Candidates from 24 to
> 40 were swept and 34 was among the best; the difference between coprime
> candidates turned out to be small, so the clean ratio decided it.
>
> The sweep also found a **hole in the coprime guard**: periods 8 and 32 passed
> every assertion — they reduce to 1:4, which is coprime and above the "not
> tiny" floor — while sitting in exact 4:1 lockstep and never drifting apart at
> all. That is precisely the failure the test existed to catch, waved through
> under the guise of the best case. Neither reduced term may now be 1.

### Vocabulary map

> **Settled in Phase 29.** The chosen register is the **log room** — real radar,
> observatory and duty-roster vocabulary, so every term has a plain meaning
> available underneath it (narrative.md rule 2). The "current thinking" column
> below is preserved as written; the **Settled** column is what shipped.
>
> | Now | Settled as | Note |
> |-----|-----------|------|
> | The Orrery | **the Perihelion** | The point of closest approach |
> | Mainspring | **the Sun** | |
> | Tension | **Output** | |
> | Movement | **Platform** | Resolves the CLAUDE.md naming collision as a side effect |
> | Chime | **Array** | |
> | Slack | **Contact** | Keeps what made "Slack" good: short, dry, faintly bureaucratic |
> | The Unwinding | **the Approach** | |
> | Filings | **Salvage** | Forced the upgrade branch named `salvage` to become `recovery` |
> | Recollection | **Recollection** | Unchanged — see prestige below |
> | Keys | **Clearance** | |
> | The Escapement | **the Service** | |
> | Wright | **Operator** | |
> | Rewinding | **Rewind** | Unchanged — see prestige below |
> | The Beat | **the Flare** | |
> | The Escapement Tree | **the Almanac** | |
> | Conjunction | **Conjunction** | Unchanged, and now literal |
>
> Two branch names moved as collateral: `winding` → `aperture` and `bracing` →
> `shielding`, both horological. The Array upgrade track `winding` became
> `recharge`.

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
>
> **Confirmed by the art.** The supplied sprites are Sun, Mercury, Venus, Earth,
> Mars, three craft and two projectiles. Four planets, and the assumption held.

### The hard problem: prestige

> **Solved with candidate 1, the time loop — and it cost nothing.** Because the
> orbits return to a filed configuration while the operator carries the memory
> forward, **Rewind** and **Recollection** both keep their literal sense.
> Phase 26's code and copy survived the reskin untouched, and P5 is satisfied by
> exactly the mechanism the mainspring used.
>
> Note the process failure this file predicted and the plan then walked into:
> the schedule below made this a "hard requirement" by Phase 26, and Phase 26
> shipped under the clockwork name anyway. It cost nothing only because the
> answer happened to be the one that required no rework. That was luck, not
> planning.

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

## Outcome — Phase 29

Carried out, in three commits: the fourth orbit, the vocabulary pass, and the
launch roster.

| Planned | Actual |
|---------|--------|
| Prep step before Stage 2 | Slipped to Phase 29. Cost: one extra hardcode site to find, in the formation editor |
| Rename Mainspring at Phase 12 | Deferred to 29 as this file allowed. Correct call — one rename, not two |
| All naming lands at Phases 29–33 | Landed at 29, in one pass. A half-renamed codebase would have been worse than either end state |
| Prestige fiction settled by Phase 26 | **Missed.** Phase 26 shipped clockwork. Cost nothing only because the chosen answer needed no rework |
| Pixel art needed at Phase 37 | Supplied early; staged under `src/assets/sprites/` awaiting the Phase 37 manifest |

### What the vocabulary pass actually took

~3,400 occurrences across ~90 files. Mechanically scripted, then compiled and
tested. Three things are worth recording for the next large rename:

1. **Word boundaries were the wrong tool.** `\bMovement\b` does not match
   `MovementDef`, `movementById` or `MOVEMENTS`, so the first attempt renamed
   prose and standalone identifiers while leaving every compound behind — a
   half-renamed tree that still compiled. Plain substring replacement is correct
   for nouns this distinctive; it was reverted and redone.
2. **`key` could not be scripted at all.** `slotKey`, `keyframes`,
   `Object.keys`, `onkeydown` and `assetKey` are unrelated to the currency, so
   Keys → Clearance was done by targeted replacement and the declarations were
   left for the compiler to find.
3. **The historical migrations had to keep their old vocabulary.** The blanket
   pass rewrote migrations 1→5 to say `salvage` and `arrayUpgrades`, which is
   wrong: a migration producing a *version 4* save must write the field names
   version 4 actually used. They were reverted, and 5→6 is where the whole
   vocabulary changes at once.

### The save migration

Schema 5 → 6 is the largest so far and the only one that is a pure rename. It
carries **both halves**: the persisted field names, and the content ids stored
inside them. The second is the easy one to forget — renaming only the fields
would leave a formation full of ids like `detent` resolving to nothing, and
those units would vanish from their slots on the next load with **no error
anywhere**. Same failure mode as a save referencing deleted content, except
self-inflicted.

### Art, as supplied

Ten PNGs, staged at `src/assets/sprites/` under the keys they will take. Two
notes for Phase 37, neither blocking:

- They are ~500×500 with **6,000–18,000 unique colours** and 1–3% partially
  transparent pixels, which means they were JPEG-compressed before the
  background was removed. Real pixel art at this block size wants tens of
  colours, not thousands.
- A regular pixel grid is still detectable in all ten, so this is **recoverable**
  by snapping to the grid and quantising rather than by redrawing. Phase 37 owns
  the pipeline and should do it there, not by hand.

### The Almanac, as constellations

The tree's layout was already derived rather than authored — four branches
taking a quadrant each, tiers stepping outward — and at seventy-two nodes that
reads as four perfect arcs. Arcs were right for the orrery, where every arm was
a piece of a mechanism; under a solar sky they read as a timetable.

The fix is the same layout, loosened. Each node is nudged off its exact position
by a fixed amount derived from a hash of its id: at most 0.06 rad around the arc
and 24px along the radius. Everything the arc communicated survives — branches
stay inside their quadrants, tiers stay in radius order, nothing needs re-nudging
when a node is added — while the arms stop being arcs. The prerequisite edges,
already drawn, become the lines joining the stars, which is what makes the
result read as a constellation rather than as scatter.

Two bounds are load-bearing and are pinned by `tests/upgradeTree.test.ts`:

- **Angular drift stays well inside the 15% margin** each quadrant leaves free,
  so no two branches ever touch.
- **The closest pair on the board stays clear.** Same-tier siblings are the
  tightest pair at 47px, and drift can only take that away; at these figures the
  authored tree's closest pair is 38.7px, comfortably clear at the 13px star
  radius the view draws.

The drift is seeded from the node id rather than from a run of random numbers so
a node sits in the same place in every session and on every machine. A
constellation that reshuffled on reload would be worse than a perfect arc — the
player navigates this panel by shape and by memory.
