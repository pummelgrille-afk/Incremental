/**
 * Animation state and frame selection.
 *
 * Pure functions over numbers — no Pixi, no DOM, no simulation. The render
 * layer asks "which state is this unit in, and which frame of it", and both
 * answers are testable in a plain Vitest process. A rule that lives inside
 * `render.ts` is a rule nothing can test, and *when* a unit looks like it is
 * attacking is exactly the kind of rule that goes subtly wrong.
 *
 * **Nothing here reads or writes the simulation.** Every input is a scalar the
 * caller already had. That is what keeps `render.ts` a pure projection: an
 * animation is a function of state the simulation was going to compute anyway,
 * never a second clock the simulation has to be kept in step with.
 */

export type AnimationState = 'idle' | 'attack' | 'hit' | 'death'

export const ANIMATION_STATES: readonly AnimationState[] = [
  'idle',
  'attack',
  'hit',
  'death',
]

export interface ClipSpec {
  /** How long one frame is held. */
  readonly secondsPerFrame: number
  /** Loop forever, or run once and hold the last frame. */
  readonly loop: boolean
}

/**
 * Timing per state.
 *
 * Idle is slow because it is on screen permanently and a fast idle reads as
 * agitation; the other three are fast because they are punctuation.
 *
 * `attack` is sized against the **fastest thing in the game**, not the average:
 * Rake attacks every 0.65s and haste cuts that further, so a wind-up has about
 * a third of a second before the next one starts. An animation that cannot
 * finish reads as a stutter rather than as an action, which is why the frame
 * budget in art-style.md is six and not "as many as you like" — at 0.05s each
 * that is 0.30s, inside the window with room for haste.
 */
export const CLIPS: Readonly<Record<AnimationState, ClipSpec>> = Object.freeze({
  idle: { secondsPerFrame: 0.16, loop: true },
  attack: { secondsPerFrame: 0.05, loop: false },
  hit: { secondsPerFrame: 0.05, loop: false },
  death: { secondsPerFrame: 0.09, loop: false },
})

/**
 * The attack frame budget handed to whoever draws these.
 *
 * Not a preference: `tests/animation.test.ts` holds it against the fastest
 * authored attack interval, so raising it means either faster frames or a
 * slower roster.
 */
export const MAX_ATTACK_FRAMES = 6

/**
 * How fast a projectile's loop runs.
 *
 * Four frames over half a second, which is what a shot needs to read as burning
 * rather than as a decal being dragged across the screen. Faster reads as noise
 * at 14px; slower and a shot that only lives half a second never completes a
 * cycle.
 *
 * Its own rate rather than `CLIPS.idle`, which is tuned for a craft sitting on
 * a ring and would be four times too slow for something crossing the field.
 */
export const PROJECTILE_SECONDS_PER_FRAME = 0.125

/** How long a clip runs, given how many frames it has. */
export function clipDuration(state: AnimationState, frameCount: number): number {
  return CLIPS[state].secondsPerFrame * Math.max(0, frameCount)
}

/**
 * Which frame to show, given how long the state has been running.
 *
 * A looping clip wraps; a one-shot holds its last frame, which is what makes
 * `death` work without the caller tracking completion. Out-of-range and
 * degenerate inputs clamp rather than throw — this runs per entity per frame,
 * and a NaN somewhere upstream must not take the renderer with it.
 */
export function frameIndex(
  state: AnimationState,
  secondsInState: number,
  frameCount: number,
): number {
  return frameAt(
    secondsInState,
    frameCount,
    CLIPS[state].secondsPerFrame,
    CLIPS[state].loop,
  )
}

/**
 * The same choice, for a clip that is not one of the four unit states.
 *
 * Projectiles loop at their own rate and have no state machine — they are
 * always simply flying — so they call this directly rather than pretending to
 * be idle.
 */
export function frameAt(
  elapsedSeconds: number,
  frameCount: number,
  secondsPerFrame: number,
  loop: boolean,
): number {
  if (!(frameCount > 1)) return 0

  const elapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0
  const raw = Math.floor(elapsed / secondsPerFrame)

  return loop ? raw % frameCount : Math.min(raw, frameCount - 1)
}

/**
 * What a Contact is doing.
 *
 * Priority order, and each step is a decision:
 *
 * 1. **hit** wins over everything a live Contact can be doing. Damage feedback
 *    that can be hidden by another state is damage feedback the player cannot
 *    rely on (P4).
 * 2. **attack** is the *telegraph*, not the moment the projectiles leave.
 *    combat-spec.md §6 makes the warning mandatory, and a wind-up that plays
 *    during the warning is the animation doing the same job as the ring the
 *    overlay draws — rather than a second, later cue that adds nothing.
 * 3. **idle** otherwise.
 *
 * Death is absent on purpose: `reapContact` removes a Contact from the field
 * the instant it dies, so there is no entity left to animate. The kill lives on
 * in the combat feed, which is where the render layer picks it up.
 */
export function contactState(input: {
  hitFlash: number
  telegraphRemaining: number
}): AnimationState {
  if (input.hitFlash > 0) return 'hit'
  if (input.telegraphRemaining > 0) return 'attack'
  return 'idle'
}

/**
 * What a Platform is doing.
 *
 * `death` means **disabled**, which is as close to death as a Platform gets —
 * combat-spec.md §5 is explicit that Platforms are never permanently lost. The
 * clip holds its last frame for the whole recovery, so a disabled unit reads as
 * out rather than as mid-animation.
 *
 * `attack` is derived from the cooldown rather than from an event: the cooldown
 * is reset to the full interval the moment a unit fires, so a cooldown still
 * near its ceiling means it fired within the last fraction of a second. That
 * keeps the simulation free of a field that exists only for the renderer.
 */
export function platformState(input: {
  disabledFor: number
  hitFlash: number
  cooldownRemaining: number
  attackInterval: number
  /** Frames in this unit's attack clip, which sets how long "recently" is. */
  attackFrames: number
}): AnimationState {
  if (input.disabledFor > 0) return 'death'
  if (input.hitFlash > 0) return 'hit'

  const window = clipDuration('attack', input.attackFrames)
  if (window > 0 && input.cooldownRemaining > input.attackInterval - window) {
    return 'attack'
  }

  return 'idle'
}
