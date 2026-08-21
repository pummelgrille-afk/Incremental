# Narrative & World

> Phase 4 output, **rewritten wholesale in Phase 29** for the solar reskin.
> Original lore, characters and tone. Zone and boss flavour text here is the
> source copy for `content/zones.ts` and `content/bosses.ts`.

> **The reskin is done.** This file described a clockwork orrery until Phase 29.
> [`theme-revision.md`](./theme-revision.md) specifies the change and records
> what it cost. The **tone** below is what survived, and it is deliberately the
> part that did: the setting became more ordinary, and the voice is what keeps
> the game from being ordinary with it.

## Premise

The Sun is under attack, and somebody has to be on shift for it.

Craft come down the gravity well from outside the charted system — not many at
once, never announced, and never the same shape twice. They make for the Sun and
nothing else. What they want with it is not known and has never been asked, on
the grounds that asking is not a procedure.

Four planets hold their orbits. The Service holds the four orbits, from a station
sitting closer in than anything is supposed to sit. It is called **the
Perihelion**, which is the point of closest approach, and which is also a date on
a rota.

## Tone

Quiet, procedural, faintly melancholy. The register is a **maintenance log**, not
an epic. Nobody in this world is a chosen one; they are on shift. Humour is dry
and comes from understatement — the sky going out noted in the same voice as a
sticking hinge.

Three rules for all written content. These are the whole reason the reskin was
survivable, and they did not change:

1. **Understate the stakes.** The Sun going out is a scheduling problem.
2. **Technical vocabulary, plain meaning.** Flavour may say *long baseline*; the
   tooltip underneath always says what it does. (P4 extends to text.)
3. **No prophecy, no destiny, no villain with a plan.** The Approach is not
   malicious. It is only ever *arriving*. That is worse.

## The player

You are an **Operator** of the Service. Not the first, not the last, not special
— the one who happens to be on shift when the Approach thickens past the point
the Manual covers.

You are never depicted and never speak. The game addresses you the way the manual
does: imperative, second person, assuming competence. *Site the inner platforms.
Do not let the Output fall.*

## The Service

The order is small — a few dozen Operators across a system that would need
thousands. They are technicians, not soldiers. Institutional voice: procedural, a
little worn-down, deeply proud in a way nobody says aloud.

**Voices that appear in flavour text:**

- **The Manual.** Not a person. Eleven hundred years of annotation in a dozen
  hands, each correcting the last. Contradicts itself. Sometimes the marginalia
  is the useful part. Source of most upgrade tooltips.
- **Operator Sabel Ock.** Dead two centuries; kept the most complete logs. Dry to
  the point of rudeness. Most-quoted, least-liked. Source of most zone epigraphs.
- **The Undermaster.** Whoever currently holds the post. Never named, because the
  post outlives its holders. Delivers stage-clear and progression text.

## The Approach

Not an invasion. A **condition of the system**.

There is no fleet, no homeworld, no general. Craft arrive down the well the way
weather arrives: continuously, at varying pressure, from a direction rather than
from a place. The Service calls the whole of it **the Approach**, singular,
because counting it as separate events stopped being useful about nine hundred
years ago.

Its craft are logged as **Contacts** — classed by silhouette, never by intent.
Nothing out there has been asked what it wants, and nothing has volunteered.

**Why they make for the Sun:** it is the largest thing in the system and the
bottom of every gradient here. Contacts fall toward it the way water falls
downhill. The bullet patterns are not aimed out of malice — they are pressure
finding the shortest path.

> *"I have read the file that argues they are hostile. It is a good file. It
> rests entirely on the fact that they keep coming, which is also true of the
> tide."*
> — Sabel Ock

## Zones

Six zones, outward from the Sun. Each is a stretch of the system the Service is
expected to hold.

### 1. The Service Floor

Where Operators work. Tool racks, chalked repair notes, tea going cold on a
console housing. The only zone that looks lived-in.

> *"Start here. Everything this close in is documented. Nothing further out is."*
> — the Manual

### 2. The Fast Orbit

Mercury's. The quickest of the four, and the one whose failure is noticed first.
Scoured smooth by eleven centuries of close work.

> *"The Fast Orbit has never once been stood down for maintenance. This is
> presented in the Manual as an achievement. I file it under reasons for the
> current state."*
> — Sabel Ock

### 3. The Veil

Venus's orbit, and nothing is seen through it. Alignments here are recorded by
instrument rather than by eye, which does not make them less rare — only harder
to be sure of afterwards.

> *"Recorded a triple conjunction at the fourth hour. Second in my service.
> Sat down for it."*
> — Sabel Ock

### 4. The Home Orbit

Earth's, and the only one with anything on it worth the word. Operators posted
here are the ones who train the replacements, which is not a promotion and is
not described as one.

> *"They will send you home eventually. Nobody has ever told me what for."*
> — the Undermaster

### 5. The Cold Line

Past Mars, where the charts give out and the Service continues anyway. Nothing
here matches the Manual. The official position is that this stretch was surveyed
and found unremarkable. Nobody believes it.

> *"The Manual's page for this stretch is blank. Not missing. Blank, and bound
> in with the rest. Someone chose that."*
> — Sabel Ock

### 6. The Unlit Orbit

The outermost. Dark for nine generations. Its station is intact; it simply has
not been staffed since before the current numbering, which is why it has no
number. Bringing it back on watch is the goal.

> *"There is a station past the Cold Line. It is not wrecked. It is only unlit.
> Those are different problems, and only one of them is ours."*
> — the Manual

## Bosses

Five milestone encounters. Each is a **failure of the watch given form** — never
a creature, never a person. This rule survived the reskin unchanged and is the
main thing keeping the bestiary from becoming somebody else's.

| Boss | Zone | Is | Flavour |
|------|------|-----|---------|
| **The Backlog** | Fast Orbit | Everything that got past, arriving at once | *"Every contact anyone ever waved through, keeping its appointment together."* |
| **The Sympathetic** | The Veil | A resonance that has learned to keep itself going | *"It is not attacking in rhythm. You are defending in its rhythm. Notice the difference."* |
| **Long Wear** | Home Orbit | Two centuries of erosion, compressed | *"Slow. Patient. It has already won against everything else here."* |
| **The Blank Page** | Cold Line | Whatever the Manual declined to describe | *"No entry. Proceed at the Undermaster's discretion."* |
| **The Dark Watch** | Unlit Orbit | The hour that station went dark, still happening | *"It is not holding the station. It is the reason the station is unlit."* |

## Achievement names

In the Manual's register — dry, procedural, occasionally rueful.

The first seven are **implemented** in `content/achievements.ts`, and a test
asserts these names against that file in order. If they drift, this document has
stopped being the source of truth it claims to be. None of the seven needed
changing for the reskin; they were never horological.

| Achievement | For | Status |
|-------------|-----|--------|
| *Signed for the Shift* | Clear the first stage | Phase 28 |
| *Within Tolerance* | Clear a stage without losing Output | Phase 28 |
| *Noted in the Log* | Trigger a first conjunction | Phase 28 |
| *Sat Down for It* | Trigger a triple conjunction | Phase 28 |
| *Documented Procedure* | Clear a zone using only Platforms from the Manual's roster | Phase 28 |
| *The Undermaster Will Hear of This* | Lose a stage with a full roster sited | Phase 28 |
| *Wound It Back* | First Rewind | Phase 28 |
| *Continuous Service* | Play across a real-world year | Phase 36 |
| *Blank, and Bound In* | Reach the Cold Line | Phase 33 |
| *Off the Manual's Pages* | Clear content past the authored zones | Phase 36 |
| *Somebody's Shift* | Return after seven days away | Phase 36 |
| *It Is Only Unlit* | Bring the Unlit Orbit back on watch | Phase 33 |

## Originality check

> *Would this stand on its own with no reference game in mind?*

This is the question the reskin made harder, and it deserves an honest answer
rather than a confident one.

**What got weaker.** "Aliens attack the sun" is a common premise. The clockwork
orrery was not, and `pillars.md` §3.1 records that trade as deliberate. The
setting no longer does the work of being unusual on its own.

**What still holds.**

- The **rotating formation grid** exists because orbits move. It was not a
  mechanic looking for a skin, and it survived the change of skin intact.
- **Conjunction** is an astronomical event before it is a synergy trigger — and
  the reskin made it literal rather than metaphorical.
- The **antagonist is a gradient**, not a faction. No villain, no invasion
  narrative, no final battle in the usual sense. This was the hardest thing to
  keep and is the most load-bearing.
- The **tone** is drawn from maintenance logs and duty rosters, a register the
  genre does not use. This is now doing most of the work.

Vocabulary is the register of a log room — *contact, picket, clearance, station,
baseline, aperture* — real radar, observatory and duty-roster language, borrowed
from working practice rather than from any game. Names, voices, zones and bosses
in this document are original to it.

Ongoing check for Stages 4–5: for every new platform, contact, zone or boss, ask
whether it derives from **the watch and its failure modes**. If it does, it
belongs. If it derives from another game's bestiary, it does not. The reskin
raised the stakes on this test rather than lowering them — with a more familiar
setting, a familiar bestiary would be the thing that finished the job.
