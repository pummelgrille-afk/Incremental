
export type AnimationState = 'idle' | 'attack' | 'hit' | 'death'

export const ANIMATION_STATES: readonly AnimationState[] = [
  'idle',
  'attack',
  'hit',
  'death',
]

export interface ClipSpec {
  readonly secondsPerFrame: number

  readonly loop: boolean
}

export const CLIPS: Readonly<Record<AnimationState, ClipSpec>> = Object.freeze({
  idle: { secondsPerFrame: 0.16, loop: true },
  attack: { secondsPerFrame: 0.05, loop: false },
  hit: { secondsPerFrame: 0.05, loop: false },
  death: { secondsPerFrame: 0.09, loop: false },
})

export const MAX_ATTACK_FRAMES = 6

export const PROJECTILE_SECONDS_PER_FRAME = 0.125

export function clipDuration(state: AnimationState, frameCount: number): number {
  return CLIPS[state].secondsPerFrame * Math.max(0, frameCount)
}

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

export function contactState(input: {
  hitFlash: number
  telegraphRemaining: number
}): AnimationState {
  if (input.hitFlash > 0) return 'hit'
  if (input.telegraphRemaining > 0) return 'attack'
  return 'idle'
}

export function platformState(input: {
  disabledFor: number
  hitFlash: number
  cooldownRemaining: number
  attackInterval: number

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
