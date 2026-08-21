# Phase 18: Synergy & Buff System

**Stage 2 — Core Combat Systems**
Output: `systems/buffs.ts`, type pairing in `content/damageTypes.ts`,
`ui/FormationEditor.svelte`, `tests/buffs.test.ts`, `tests/synergy.test.ts`

## Checklist

- [x] Ally-to-ally synergy via formation adjacency — already shipped in Phase 8's
      `recomputeBonuses`; verified against combat-spec.md §2's table
- [x] Ally-to-ally synergy via type pairing — new
- [x] Buff/debuff stacking rules and duration
- [x] Synergy-preview affordance in `ui/FormationEditor.svelte`

## The half that already existed

PLAN.md asks for synergy "via formation adjacency **or** type pairing". Adjacency
has been live since Phase 8 — ring placement, filled neighbours, screened slots
and full rings, cached on formation change and never recomputed per tick. So this
phase owed the *other* half, plus the buff machinery both depend on.

## Type pairing

Two damage types **oppose** when each is favourable against exactly what the
other is unfavourable against. That is derived from the §7 matrix rather than
written out again, so the two facts cannot drift apart — and it independently
reproduces the pairs the matrix was designed around, Shear↔Percussive and
Thermal↔Resonant. A test asserts the derivation still agrees with the prose.

| Pairing | When | Magnitude | Pulse arc |
|---------|------|-----------|-----------|
| **Matched** | every participant shares one type | ×1.25 | 0.5 rad |
| **Interference** | any two participants oppose | ×0.7 | **1.0 rad** |
| **Mixed** | neither | ×1 | 0.5 rad |

**Interference had to be a trade, not a tax.** A flat penalty for mixing types
would quietly mandate mono-type formations, and the type matrix exists precisely
so that most waves have two workable answers. Doubling the pulse arc means a
mixed formation catches a scattered wave that a matched one sweeps past — which,
after the Phase 17 change made every zone-1 wave scattered, is a live
consideration rather than a hypothetical one.

## Buffs: one stacking rule

**The stronger grant wins. An equal-or-weaker grant only extends what is already
there. Nothing accumulates.**

Not a new decision — combat-spec.md §5 already said exactly this for the
Mainspring's shield, with the reasoning that stacking lets a player bank
conjunctions into an invulnerability window. `systems/buffs.ts` now owns the rule
for both, and a test drives the same sequence of grants through both
implementations and asserts they agree.

Movements had been doing `shield += magnitude` — unbounded, and against the spec.

Durations are now **read from content**. `ConjunctionEffect.duration` had been
declared and never read: Detent's shield said 5 s and Pallet's haste said 4 s, and
neither number reached the simulation. In their place was a decay that eroded
buffs at fixed rates (0.25/s and 0.2/s) unrelated to anything authored.

Two consequences that fall out of the rule:

- **A disabled unit loses every buff.** It returns at full HP after the recovery
  window; carrying a shield through that would make being disabled partly free.
- **A spent shield clears its own clock.** Otherwise draining a 40-shield would
  refuse a fresh 20-shield for the rest of the original duration.

### Debuffs are deliberately not implemented

PLAN.md says "buff/debuff". "Stronger wins" is ambiguous for a penalty — the
stronger debuff is the *more negative* one — and no content authors a debuff yet.
Guessing the comparison and leaving it unexercised is how this project keeps
producing bugs, so `grantBonus` throws on a negative magnitude instead. Phase 31's
Slack roster is where a debuff would first appear and owns designing that half.

`repair` was removed from `ConjunctionEffect` for the same reason: a declared
effect kind that no ally used. Phase 29's roster earns it back.

## A real bug: levelling was being erased

`attackMultiplier` held **two different things**. `createMovement` set it to the
level-scaling factor `1 + (level - 1) × 0.12`; `updateBuffs` treated it as a
transient buff and decayed it toward 1 every tick.

A level-5 Movement therefore started a stage at ×1.48 damage and was ground back
to ×1.00 within about two and a half seconds of combat. Levelling's entire damage
benefit evaporated almost immediately.

Nothing caught it because everything currently runs at level 1, where the scale is
exactly 1 and the decay is a no-op. **Phase 24 turns levelling on**, and this
would have shipped as "levels feel like they do nothing" with no obvious cause.

The fix is to stop one field meaning two things:

| Field | Is | Decays |
|-------|-----|--------|
| `levelScale` | permanent, from level | never |
| `bonuses.attack` | formation placement | never; recomputed on change |
| `buffs.attack` | transient | on its authored duration |

`attackScaleOf()` composes the three. A test places a level-5 unit, runs 20 s of
buff updates, and asserts its scale is untouched.

The same conflation existed on Chimes (`attackMultiplier` = level scale) along
with a `hasteBonus` field nothing ever wrote. Chimes do not participate in
conjunctions (§4) and nothing else grants them a buff, so the dead field is gone;
Phase 25's support upgrades own transient Chime modifiers.

## The preview

combat-spec.md §3 calls time-to-next-conjunction **"a hard requirement, not a
nice-to-have — without it the mechanic is invisible"**. `ui/FormationEditor.svelte`
now exists as a read-only panel on `F`:

- the countdown to the next alignment
- the formation's pairing, and a sentence on what that does
- per-slot placement bonuses
- a live count of shielded and hastened units

Phase 24 owns the editing half — drag-and-drop, roster, saved loadouts.

Two things it had to get right:

**The countdown is an absolute simulation time, not a remaining duration.** The
rings keep turning between recomputes, so a stored countdown goes stale the moment
it is written. The store holds `nextConjunctionAt` and the UI derives the
remainder each frame.

**It must not run per frame.** `timeToNextConjunction` steps the rings forward up
to two minutes at 0.1 s and runs an O(n²) angular comparison at each step. It is
recomputed only when `formationVersion` changes or the predicted alignment passes.
The expensive case is self-limiting: when an alignment is imminent the search
exits on its first step, and when it is far away the answer is far away too, so
the next recompute is a long time off.

A known gap: a unit being **disabled** changes the true answer without bumping
`formationVersion`, so the preview can be briefly stale. It self-corrects at the
predicted time. Bumping the version on disable would recompute during the busiest
moment of a fight, which is the wrong trade for a planning aid.

## Verified in the browser

Panel opens on `F` against a live stage: countdown running (5.2 s → 3.8 s across
reads), pairing correctly reading **Interference** for the starting formation
(percussive Detent and Hammer, shear Pallet), live buff counts moving, per-slot
bonuses matching §2's table — a ring-1 Detent showing +20% defence is +15% for
ring 1 plus +5% for being screened. No console errors.

## Test coverage

357 tests passing; 48 added across `tests/buffs.test.ts` and
`tests/synergy.test.ts`: the stacking rule and its agreement with the Mainspring's,
expiry semantics, shield depletion through use, buff loss on disable, level
scaling surviving combat, type opposition (symmetry, self-exclusion, exactly one
opposite per type, agreement with the documented pairs), pairing of groups,
interference trading magnitude for arc, uptime bounded by cooldown rather than
stacking, and the preview's honesty — that it restores ring phases exactly, and
that the alignment it predicts actually arrives.

## Carried forward

| Phase | Item |
|-------|------|
| 24 | Levelling goes live; `levelScale` is the field it must move, not `buffs` |
| 24 | Editing half of `FormationEditor.svelte` |
| 25 | Transient Chime modifiers, if support upgrades want them |
| 29 | A healer ally earns `repair` back as a conjunction effect |
| 31 | Debuffs — and the sign-aware stacking comparison they need |
