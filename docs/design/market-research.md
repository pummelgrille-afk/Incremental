# Competitive & Market Research

> Phase 2 output. Surveys the three genres this game sits between, so no single
> title becomes a blueprint. Read alongside `pillars.md`.

## Why survey broadly

The plan is explicit about this (PLAN.md, "On originality"): the systems here —
auto-battle, bullet patterns, skill trees, deck-building, idle accrual — are
common genre building blocks. Assembling them is not copying; leaning on one
game's specific premise, characters, biomes or art direction would be. Surveying
several games per space keeps any one of them from becoming the template.

## Space 1 — Incremental / idle

Representative: *Cookie Clicker*, *AdVenture Capitalist*, *Antimatter Dimensions*,
*Realm Grinder*, *Melvor Idle*, *NGU Idle*.

**Patterns that recur:**
- Exponential cost curves against linear-ish income, so each purchase buys roughly
  constant *time* rather than constant power.
- A prestige reset that trades current progress for a permanent multiplier, usually
  unlocked once the first curve visibly stalls.
- Offline accrual as a retention mechanism, almost always at a reduced rate.
- Layered currencies, where a later currency prices things the earlier one cannot.

**Common failure mode:** the mid-game "dead zone" — the stretch after the novelty
of the first prestige and before the second layer opens, where the player is
waiting rather than deciding.

**Our answer:** the combat layer keeps decisions live during accrual. Ring
arrangement and conjunction planning give the player something to do that is not
"wait for the counter". P1 and P2 in `pillars.md` exist to hold this line.

## Space 2 — Auto-battlers

Representative: *Super Auto Pets*, *Teamfight Tactics*, *Dota Underlords*,
*Backpack Battles*, *Storybook Brawl*.

**Patterns that recur:**
- Commitment happens *before* the fight; the fight itself is a readout of a
  decision already made.
- Synergy by type or adjacency is the main source of combinatorial depth.
- Economy tension between spending now and saving for a stronger later board.
- A legible board so the player can diagnose *why* they lost.

**Common failure mode:** the board is static, so once arranged, watching it is
inert — the game becomes a slideshow between decisions.

**Our answer:** the board rotates. Because rings turn at different rates, a fixed
arrangement produces a changing situation, and the watching phase carries real
information — you are watching for conjunctions and for which arc is about to be
under-defended.

## Space 3 — Bullet-hell & survivor-likes

Representative: *Vampire Survivors*, *Brotato*, *20 Minutes Till Dawn*,
*Nova Drift*, *Enter the Gungeon*, and the traditional danmaku lineage.

**Patterns that recur:**
- Density scaled as a difficulty dial, with readability preserved by silhouette and
  colour separation rather than by reducing count.
- Telegraph-then-threat: every dangerous thing announces itself first.
- The survivor-like subgenre's key insight — automating the *firing* while keeping
  the *positioning* manual is enough to preserve the feel.

**Common failure mode:** execution demands gate the audience. Players who enjoy
watching dense patterns resolve often cannot survive them.

**Our answer:** we automate firing *and* remove positioning from the player
entirely. Rings turn on their own; the only live input is the Beat, which is
instant and area-based, so there is nothing to aim and nothing to miss (P3). The
spectacle survives; the dexterity requirement does not.

## The loop every one of them shares

Across all three spaces, stripped of theme, the same circuit recurs:

```
resource → permanent upgrade → stronger squad → deeper content → more resource
```

The genres differ only in *where they put the player's hands*:

| Space | Player's hands are on... | Fight is... |
|-------|--------------------------|-------------|
| Incremental | the purchase order | invisible |
| Auto-battler | pre-fight arrangement | a readout |
| Bullet-hell | moment-to-moment position | the whole game |
| **This game** | **arrangement, plus one optional strike** | **a readout you can lean on** |

That last row is the actual design thesis. We take the auto-battler's
"commit before the fight" and add one coarse steering input during it, which is
the seam none of the three spaces occupies cleanly.

## What the Orrery lets us do differently

1. **A formation surface with its own clock.** Rotation is a second axis of
   arrangement — *when* a unit passes an arc, not just *where* it sits. No surveyed
   auto-battler has this, because their boards do not move.
2. **Conjunction as planned-payoff synergy.** Adjacency synergy is universal in the
   auto-battler space; synergy that fires when units on *different, differently
   paced* rings align is specific to a rotating board and gives the watching phase
   genuine suspense.
3. **A reset with no loss of memory.** Prestige is usually framed as sacrifice.
   Rewinding a mainspring while the Wright keeps their memory reframes it as
   returning better-informed, which directly addresses the genre's reset-fatigue.
4. **Readability from the palette up.** Warm brass on a dark field is a natural
   high-contrast scheme for dense projectiles — the art direction and the
   legibility pillar (P4) point the same way instead of fighting.

## Risks carried forward

| Risk | Where it bites | Mitigation |
|------|----------------|------------|
| Rotation makes the board hard to read | Phases 17, 42 | Ring speeds stay slow and are always visibly indicated; conjunction previews before firing |
| Single input feels too thin | Phase 10 | Phase 10 explicitly asks "does this feel good?" — answer it before Stage 2 |
| Horological vocabulary reads as jargon | Phases 23, 36 | Tooltips carry plain-language effect text; flavour never replaces clarity |
| Idle play trivialises arrangement | Phase 27 | Offline accrual is capped and diminishing; conjunction does not fire while idle |
