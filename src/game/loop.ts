import { game } from './state.svelte'
import { save } from './save'

/**
 * Simulation runs on a fixed timestep so progression is identical whether the
 * player is on a 60Hz or 144Hz display, and so a stalled tab cannot skip ahead.
 * Rendering is left to Svelte, which reacts to the state the ticks produce.
 */
const TICK_SECONDS = 1 / 20
const MAX_CATCHUP_SECONDS = 5
const AUTOSAVE_SECONDS = 10

export function startLoop(): () => void {
  let previous = performance.now()
  let accumulator = 0
  let sinceSave = 0
  let frame = 0

  const step = (now: number) => {
    frame = requestAnimationFrame(step)

    // Clamp so a backgrounded tab resumes smoothly instead of fast-forwarding.
    const elapsed = Math.min((now - previous) / 1000, MAX_CATCHUP_SECONDS)
    previous = now
    accumulator += elapsed

    while (accumulator >= TICK_SECONDS) {
      game.tick(TICK_SECONDS)
      accumulator -= TICK_SECONDS
    }

    sinceSave += elapsed
    if (sinceSave >= AUTOSAVE_SECONDS) {
      sinceSave = 0
      save()
    }
  }

  frame = requestAnimationFrame(step)
  return () => cancelAnimationFrame(frame)
}
