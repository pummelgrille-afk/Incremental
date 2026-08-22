# Phase 41: Sound Design & Music

**Stage 5 — Art & Audio** (final phase)
Output: `content/audio.ts`, `core/audioMix.ts`, `core/audio.ts`, wiring in
`core/bootstrap.ts`, `tests/audio.test.ts`, architecture.md §Layer boundaries

## Checklist

- [x] SFX for attacks, hits, pickups, UI and achievement pop-ups
- [x] Music reflecting the world's tone
- [x] Adaptive mixing between idle and combat intensity
- [x] The three volume settings, connected for the first time
- [ ] **Judged by ear** — see "What could not be verified"

## Synthesised, not sampled

Every sound in the game is a recipe — a waveform, a pitch, an envelope, a
filter — rather than a file. The same argument the starfield makes in
art-style.md §8: it costs no bytes, it is exact at any length, and it is tuned
by changing a number rather than by re-recording.

It is also what this world sounds like. narrative.md asks for "quiet,
procedural, faintly melancholy — the register is a maintenance log, not an
epic". A maintenance log has no orchestral hits in it. It has ticks, a hum, a
bell somewhere down the corridor, and long stretches of a machine running
correctly.

The one place the game is allowed to sound like *something* is the conjunction,
which gets a bell tuned to a just-intoned triad — 1, 5/4, 3/2. A conjunction is
a coincidence of orbital periods, and a simple frequency ratio is exactly that.
The chord grows with the alignment: two notes for a Minor, four for a Grand.

## Frequency is the design problem, a third time

Phase 40 learned it with particles: what an effect costs is how often it fires.
Sound is stricter, because **sound accumulates where light does not**. A hundred
overlapping copies of one click is not a loud click — it is a completely
different noise, and a worse one.

So the loud cues are the rare ones and the common ones are limited or absent:

- **A Platform firing has no sound at all.** Up to 48 of them fire about once a
  second. That is a perfectly readable picture and an unlistenable buzz.
- **The audible hit is the Array's**, because there are at most eight Arrays.
  This needed `CollisionResult.contactHits`, counted separately from Platform
  attacks for exactly this reason.
- **Every cue carries a minimum interval** — the audio equivalent of the
  particle budget, and a refusal rather than a queue.
- **Sixteen concurrent voices, hard.** Past roughly a dozen simultaneous sounds
  a human hears texture rather than events, so the twenty-first voice does not
  merely waste something, it destroys the twenty before it.

Measured in real-time play: **two concurrent voices** against that ceiling.

## The mix breathes, and never buries

Intensity is computed from three things, and each earns its place: how much is
on screen against the Contact budget, how hurt the objective is, and whether a
wave is running at all. A nearly-dead Sun with two Contacts left is not a calm
moment, and a mix that said so would be lying at exactly the moment the player
most needs telling. Between waves it goes to zero — game-loop.md's health check
asks whether a wave boundary "feels like a safe place to stop", and it should
sound like one.

The two are combined with `max`, not a sum: a busy field and a wounded objective
are each independently a reason to be at full intensity, and adding them would
saturate on a merely busy one.

**The bed gets brighter with intensity, not louder.** Raising a drone under a
dense wave would bury the cues that matter — the Sun hit above all, which is the
only genuinely alarming sound in the game and matters most exactly when the
screen is least readable. Opening a filter makes it present without taking any
headroom from the top end, where every cue lives.

It follows slowly, and rises faster than it falls: arriving danger should be
heard at once, the calm after should arrive gently. A mix that tracked the
Contact count exactly would pump on every spawn, which is the most fatiguing
thing an adaptive score can do.

## Three settings that did nothing for thirty-three phases

`masterVolume`, `musicVolume` and `sfxVolume` have been in the save schema since
Phase 8 and were read by **nothing**. The same dead configuration as `assetKey`
before Phase 37 and the Platform colour table before it — this project keeps
finding these, and the pattern is always the same: a field that was obviously
going to be needed, added early, and then never wired.

They are bus gains now. The master is squared, because loudness is perceptual
and a linear fader spends most of its travel in the top of its range — half way
would sound nearly as loud as full and the control would feel broken. The other
two are trims and stay linear; squaring all three compounded, and see "Levels"
below for what that cost.

There is still no UI for them — Phase 43 owns menus and settings. The values are
read from the save at startup and on change.

## Nothing plays before the player asks

The context starts suspended and resumes on the first real input. That is not
politeness: every browser refuses to start audio before a user gesture, so a
game that tried would simply be silent with no error anywhere. The Flare is the
natural place to wake it — the player's one live control, so the first sound
arrives at the first moment they did something.

If there is no `AudioContext` at all — a headless run, an old browser, a
locked-down device — `createSilentAudio()` answers every call and the game is
playable in silence. No caller needs a null check.

## The architecture rule was one file out of date

`core/audio.ts` is the second module in the project to touch a browser API, and
architecture.md's rule 1 said none may. The diagram had always shown
`render.ts` outside the framework-free band while the prose said otherwise; a
second file made the gap worth closing rather than noting.

The rule now names an **output layer of exactly two files**, with a narrow test
for what belongs in it: *does it need the API to answer the question?* Choosing
an animation frame does not. Choosing a bus gain does not. Building a filter
node does. Everything decidable stays in `core/audioMix.ts`, `core/animation.ts`
and `core/backdrop.ts`, which import nothing and are tested without a DOM.

## Levels, measured rather than argued

The first version of every number here was reasoned about and never measured,
and it was wrong twice over — in opposite directions, which is why reasoning
alone could not have caught it.

**The chain was multiplied four deep.** `busGains` squared all three faders,
so the default 0.8 master and 0.8 SFX cut everything to 41% before a sound was
shaped. No individual number was wrong. The perceptual curve belongs on the
master, which is the volume control; the other two are trims and are linear now.

**The bed was inaudible.** Three sine drones at 55, 82 and 165 Hz under a 240 Hz
lowpass measured 0.023 RMS — about -33 dBFS, and all of it below what a laptop
speaker reproduces at all. Sines have no harmonics, so rolling off the
fundamental leaves literally nothing. It is five voices now, triangles above the
sub, reaching 330 Hz, under a 700 Hz filter.

**Then the cues were inaudible.** With the bed fixed at 0.087 RMS, `hit` and
`kill` measured *at or below it*: the two commonest sounds in the game, drowned
by their own music. The bed is the constant and everything else is transient, so
the constant gave way — 0.087 down to 0.047.

An `AnalyserNode` on the master makes this measurable at all, and it stays:
`stats.level` is the RMS of everything reaching the output. "Is the music
playing" should not be a question only speakers can answer.

Contribution above the bed, measured in the running game:

| Cue | Level | vs bed |
|-----|-------|--------|
| conjunction (Grand) | 0.154 | 3.2× |
| kill | 0.090 | 1.9× |
| sunHit | 0.078 | 1.7× |
| flare | 0.067 | 1.4× |
| purchase | 0.066 | 1.4× |
| block | 0.056 | 1.2× |
| manualOpen | 0.055 | 1.2× |
| pageTurn | 0.054 | 1.1× |
| hit | 0.026 | 0.5× |
| ui | 0.023 | 0.5× |

The ordering is the design: the moment the formation paid off is the loudest
thing in the game, the objective being hurt is near the top, everything the
player acts on clears the bed — and the two commonest cues sit *under* it on
purpose, because they are texture rather than events.

A last trap worth recording: for a noise cue the **cutoff is the loudness
control**, not the gain. Lowpassed white noise keeps only the energy below its
corner, so `manualOpen` at a generous-looking 0.7 gain measured below the bed
until its filter opened from 1200 Hz to 1800.

## The Manual has a book in it

`H` opens the Manual with a low woody whumph and each card turned makes a paper
sound — noise with a fast bright tail, because anything tonal there would read
as a notification instead.

The card is dismissed inside `ui/Tutorial.svelte`, which cannot reach the audio
engine: `stores/` is the only bridge into Svelte and it carries state, not
events. Rather than inventing a channel to announce a page turn, the frame loop
notices the queue has got shorter. The shrinking *is* the event.

## The score, from a measured reference

The first music was five sustained tones on one chord, forever. That was a
deliberate choice — "a tune has a beginning and would need an end" — and the
result was a filtered fridge hum. A reference track was supplied as a **file**,
which is a different proposition from a link: a file can be measured.

What the analysis found, and what was taken from it:

| Measured | Taken as |
|---|---|
| Transients every 0.221s when busy | eighth notes at ~134 BPM (132 is used) |
| Spectral change 0.32 busy vs 0.12 calm | plucked when busy, sustained when calm |
| Sub-bass 2.1% calm → 15.2% busy | the bass is a layer that *arrives* |
| Chroma peaking on C, then F, A, G | the C major / A minor family |
| Loud section 33s–83s of 118s | arrangement by section, not by volume |

What was **not** taken is the music. A tempo, a mode and "the bass enters when
it opens up" are the vocabulary of a genre; the tune is the piece. The
progression, the voicings and the arpeggio figure are written from scratch
against those parameters.

The last row turned out to be the useful one. That track changes its
*arrangement* rather than its volume — which is exactly what an adaptive score
should do, and what the mix here had been reaching for by opening a filter and
nothing else. Now:

| Intensity | Layers | Measured level |
|-----------|--------|----------------|
| calm | pad | 0.008 – 0.078, swelling once a bar |
| busy (0.26) | + bass | peak 0.131 |
| overwhelmed (0.97) | + arp | peak 0.136, median 0.070 |

Layers arrive with **hysteresis** rather than on a threshold: `combatIntensity`
sits near a boundary for long stretches by design, and a layer blinking in and
out is worse than either state it blinks between.

Notes are **scheduled ahead of the clock**, not fired from the frame loop. Web
Audio's clock is sample-accurate and the frame loop is not; eighth notes
triggered per frame arrive with whatever jitter the browser had that moment,
which is plainly audible as an unsteady pulse. Each frame places everything due
in the next 350 ms at exact times, and the browser stops being able to affect
the timing.

`core/music.ts` holds the part that can be wrong without anyone hearing why — a
progression that walks off its array, an arpeggio landing outside its chord, a
layer that flickers. The arpeggio indexes the *chord's voicing* rather than the
scale, which is what keeps it consonant as the harmony moves underneath it
without anyone exercising taste, and a test walks every bar to prove it.

## What could not be verified

**Whether any of it sounds good.** There is no audio device in the environment
this was built in. Levels are now measured rather than guessed, which rules out
the two failures that had already happened — inaudible music, and cues buried
under it — but a correct level is not the same as a pleasant sound. Nothing here
can tell you whether the kill cue grates after an hour.

Twenty tests cover the decidable half: the gain curve, the intensity model, the
rate limits, the chord ratios, and that the bed sits below every cue in both
pitch and volume. None of that can tell you whether the kill cue is annoying
after an hour.

The specific things to listen for, and the likely first complaints:

- **The hit cue may still be too frequent** even limited to Arrays. Its
  `minInterval` is the one number to raise.
- **The score may be too present** in a long session, or too sparse.
  `LAYER_GAIN` is three numbers and `PROGRESSION` is eight chords.
- **The conjunction bell fires up to three times a second** at its rate limit,
  with a 1.6s release — overlapping bells may wash. If so, the limit wants to be
  nearer the release length.
