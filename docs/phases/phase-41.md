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

They are bus gains now, squared rather than linear. Loudness is perceptual: a
linear fader spends most of its travel in the top of its range, so half way
sounds nearly as loud as full and the control feels broken.

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

## What could not be verified

**Whether any of it sounds good.** There is no audio device in the environment
this was built in, so what is confirmed is that the engine fires — voices rise
and fall with play, the rate limits refuse what they should, the mix tracks the
field — and not that the result is pleasant, balanced, or in tune with itself.

Twenty tests cover the decidable half: the gain curve, the intensity model, the
rate limits, the chord ratios, and that the bed sits below every cue in both
pitch and volume. None of that can tell you whether the kill cue is annoying
after an hour.

The specific things to listen for, and the likely first complaints:

- **The hit cue may still be too frequent** even limited to Arrays. Its
  `minInterval` is the one number to raise.
- **The bed may be too present** in a long session. `DRONE_GAIN` is one number.
- **The conjunction bell fires up to three times a second** at its rate limit,
  with a 1.6s release — overlapping bells may wash. If so, the limit wants to be
  nearer the release length.
