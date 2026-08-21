import { movementById, MOVEMENTS } from '../content/allies'
import { CHIMES } from '../content/supportUnits'
import { STARTING_ZONE_ID } from '../content/zones'
import { game } from '../stores/game.svelte'
import { Autosaver } from './autosave'
import { mountChime, placeMovement } from './formation'
import { Simulation } from './loop'
import { createRenderer, type Renderer } from './render'
import { createRng, seedFrom } from './rng'
import { SaveManager } from './save'
import type { SaveData } from './saveSchema'
import { loadStage } from './stageLoader'
import type { StageAddress } from '../entities/Zone'

/**
 * Wires the simulation, renderer, input and autosave together.
 *
 * This is the seam where the framework-free simulation meets the browser: the
 * only module that owns a requestAnimationFrame handle, DOM listeners, and the
 * store projection. Everything it drives is testable without it.
 */

const DEFAULT_STAGE: StageAddress = `${STARTING_ZONE_ID}:first-shift`

export interface GameSession {
  destroy(): void
  restart(): void
  readonly simulation: Simulation
}

/**
 * A starting formation for the Phase 10 slice.
 *
 * Two Movements on *different* rings, because conjunction cannot occur
 * otherwise and answering combat-spec.md §9 is the point of this phase.
 * Phase 24 replaces this with the player's saved loadout.
 */
function seedFormation(simulation: Simulation): void {
  const sim = simulation.state

  const hammer = movementById('hammer')
  const detent = movementById('detent')
  const pallet = movementById('pallet')

  if (detent) {
    placeMovement(sim, detent, 1, 0)
    placeMovement(sim, detent, 1, 3)
  }
  if (hammer) {
    placeMovement(sim, hammer, 2, 0)
    placeMovement(sim, hammer, 2, 5)
  }
  if (pallet) {
    placeMovement(sim, pallet, 3, 0)
    placeMovement(sim, pallet, 3, 7)
  }
  if (CHIMES[0]) {
    mountChime(sim, CHIMES[0], 0)
    mountChime(sim, CHIMES[0], 4)
  }
}

export async function startGame(host: HTMLElement): Promise<GameSession> {
  const saves = new SaveManager()
  const loaded = saves.load()
  let saveData: SaveData = loaded.data

  if (loaded.notices.length > 0) {
    console.info('[orrery] save notices:', loaded.notices)
  }

  let simulation = buildSimulation()
  const renderer: Renderer = await createRenderer(host)

  game.showDiagnostics = saveData.settings.showFps

  const autosaver = new Autosaver(saves, () => saveData, { intervalSeconds: 15 })

  function buildSimulation(): Simulation {
    // Seeded from the stage address, so a stage always plays the same way and
    // a balance observation is reproducible.
    const rng = createRng(seedFrom(DEFAULT_STAGE))
    const sim = new Simulation(loadStage(DEFAULT_STAGE), rng)
    seedFormation(sim)
    return sim
  }

  // --- Input: the Beat is the entire live control surface. ------------------
  //
  // Click anywhere on the field to strike that point. Instant and area-based,
  // so there is nothing to aim and nothing to miss (combat-spec.md §1).

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return
    const world = renderer.toWorld(event.clientX, event.clientY)
    simulation.strike(world.x, world.y)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'r') session.restart()
    if (event.key === 'F2') {
      event.preventDefault()
      // Persisted, so a profiling session survives a reload.
      saveData.settings.showFps = !saveData.settings.showFps
      game.showDiagnostics = saveData.settings.showFps
      autosaver.request('purchase')
    }
  }

  host.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('keydown', onKeyDown)

  // Flush the save when the tab goes away. The autosaver itself stays DOM-free;
  // this is the app layer's job (Phase 9).
  const onHide = () => autosaver.flush('shutdown')
  window.addEventListener('beforeunload', onHide)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') onHide()
  })

  // --- The frame loop. ------------------------------------------------------
  let previous = performance.now()
  let frame = 0
  let fpsAccumulator = 0
  let fpsFrames = 0

  const step = (now: number) => {
    frame = requestAnimationFrame(step)

    const elapsedMs = now - previous
    previous = now
    const elapsed = elapsedMs / 1000

    const simStart = performance.now()
    const events = simulation.advance(elapsed)
    const simMs = performance.now() - simStart

    // Bank whatever the stage produced, and tell the autosaver about it.
    if (events.filingsDropped > 0) {
      saveData.run.filings += events.filingsDropped
      saveData.statistics.totalFilingsEarned += events.filingsDropped
    }
    if (events.slackKilled > 0) {
      saveData.statistics.totalSlackDestroyed += events.slackKilled
    }
    if (events.conjunctionsFired > 0) {
      saveData.statistics.conjunctionsFired += events.conjunctionsFired
    }
    if (events.stageCleared) autosaver.request('stage-clear')

    saveData.statistics.playtimeSeconds += elapsed
    autosaver.tick(elapsed)

    const renderStart = performance.now()
    renderer.render(simulation)
    const renderMs = performance.now() - renderStart

    // Step 11: publish the projection. The only write into Svelte.
    game.syncFrom(simulation)
    game.simMs = simMs
    game.renderMs = renderMs
    game.frameMs = elapsedMs

    fpsAccumulator += elapsed
    fpsFrames++
    if (fpsAccumulator >= 0.5) {
      game.fps = fpsFrames / fpsAccumulator
      fpsAccumulator = 0
      fpsFrames = 0
    }
  }

  frame = requestAnimationFrame(step)

  const session: GameSession = {
    get simulation() {
      return simulation
    },

    restart() {
      simulation = buildSimulation()
      game.reset()
    },

    destroy() {
      cancelAnimationFrame(frame)
      host.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('beforeunload', onHide)
      autosaver.flush('shutdown')
      renderer.destroy()
    },
  }

  if (import.meta.env.DEV) {
    // Dev handle for profiling without requestAnimationFrame, which is
    // throttled in backgrounded and headless tabs. Phase 11 formalises this.
    ;(window as unknown as Record<string, unknown>).__orrery = {
      get simulation() {
        return simulation
      },
      renderer,
      session,
      content: { MOVEMENTS, CHIMES },
    }
  }

  return session
}
