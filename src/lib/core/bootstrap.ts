import { movementById, MOVEMENTS } from '../content/allies'
import { chimeById, CHIMES } from '../content/supportUnits'
import { STARTING_ZONE_ID, ZONES } from '../content/zones'
import { game } from '../stores/game.svelte'
import { applyStageClear, earnFilings, recordDepth } from '../progression/currencies'
import {
  levelsOf,
  levelUp as levelUpUnit,
  rosterOf,
  unlock as unlockUnit,
} from '../progression/roster'
import {
  deletePreset as deletePresetFrom,
  grantStartingLoadout,
  loadPreset as loadPresetFrom,
  mountChime as mountSaved,
  nextMountCost,
  nextSlotCost,
  placeMovement as placeSaved,
  removeMovement as removeSaved,
  savePreset as savePresetTo,
  unmountChime as unmountSaved,
} from '../progression/loadout'
import {
  effectsOf,
  pathTo,
  purchase as purchaseNode,
  refundValue,
  respec as respecTree,
  isTreeRevealed,
  treeLayout,
  treeStatus,
} from '../progression/upgradeTree'
import { Autosaver } from './autosave'
import {
  applyFormation,
  mountChime,
  placeMovement,
  recomputeBonuses,
  removeMovement,
} from './formation'
import { Simulation } from './loop'
import { createRenderer, type Renderer } from './render'
import { createRng, seedFrom } from './rng'
import { SaveManager } from './save'
import type { SaveData } from './saveSchema'
import { loadStage, stageOrder } from './stageLoader'
import type { StageAddress } from '../entities/Zone'
import type { RingIndex } from '../entities/types'
import type { SimulationState } from './simulation'

/**
 * Wires the simulation, renderer, input and autosave together.
 *
 * This is the seam where the framework-free simulation meets the browser: the
 * only module that owns a requestAnimationFrame handle, DOM listeners, and the
 * store projection. Everything it drives is testable without it.
 */

const DEFAULT_STAGE: StageAddress = `${STARTING_ZONE_ID}:first-shift`

/**
 * The play order, until Phase 33 builds a real stage-select.
 *
 * Clearing a stage currently advances to the next one in this list. That is
 * deliberately the simplest thing that removes a dead end: before it, a cleared
 * stage stopped the simulation with nowhere to go, which made every later
 * phase's playtesting a restart-per-stage exercise.
 *
 * Phase 33 replaces this with `ui/StageSelect.svelte` and real unlock gating.
 */
const PLAY_ORDER = stageOrder(ZONES)

function nextStageAfter(address: StageAddress): StageAddress | null {
  const index = PLAY_ORDER.indexOf(address)
  if (index < 0 || index + 1 >= PLAY_ORDER.length) return null
  return PLAY_ORDER[index + 1]
}

export interface GameSession {
  destroy(): void
  restart(): void
  readonly simulation: Simulation
}

/**
 * Field the player's saved formation.
 *
 * Replaces the Phase 10 hardcoded slice. A save with an empty formation gets
 * nothing — which is correct now that Filings buy slots: an empty field is the
 * honest starting state, not a bug.
 */
function fieldFormation(simulation: Simulation, save: SaveData): void {
  applyFormation(
    simulation.state,
    save.run.formation,
    movementById,
    levelsOf(save, 'movement'),
  )

  const chimeLevels = levelsOf(save, 'chime')
  for (const [mount, defId] of Object.entries(save.run.mounts)) {
    const def = chimeById(defId)
    if (!def) continue
    // Silently skip a mount that no longer exists, for the same reason
    // `applyFormation` skips a missing Movement: a save must survive content
    // changing, and refusing to load would be worse than a missing unit.
    try {
      mountChime(simulation.state, def, Number(mount), chimeLevels[defId] ?? 1)
    } catch {
      continue
    }
  }
}

export async function startGame(host: HTMLElement): Promise<GameSession> {
  const saves = new SaveManager()
  const loaded = saves.load()
  let saveData: SaveData = loaded.data

  grantStartingLoadout(saveData)

  if (loaded.notices.length > 0) {
    console.info('[orrery] save notices:', loaded.notices)
  }

  /**
   * The tree's aggregate, recomputed only when a purchase changes it.
   *
   * `effectsOf` walks every purchased node, and the frame loop reads it for the
   * Salvage multiplier — a per-frame walk of ~72 ids to produce a number that
   * changes a handful of times per run.
   */
  let effects = effectsOf(saveData)
  let effectsVersion = saveData.meta.purchasedNodes.length

  const currentEffects = () => {
    if (saveData.meta.purchasedNodes.length !== effectsVersion) {
      effectsVersion = saveData.meta.purchasedNodes.length
      effects = effectsOf(saveData)
    }
    return effects
  }

  /**
   * Push the tree to the view, and install the callbacks it spends through.
   *
   * Called on change rather than per frame: `treeStatus` walks every node and
   * the result moves a handful of times per run.
   */
  const publishTree = (): void => {
    const positions = new Map(treeLayout().map((l) => [l.nodeId, l]))
    game.tree = treeStatus(saveData).map((status) => {
      const at = positions.get(status.node.id)
      return {
        id: status.node.id,
        name: status.node.name,
        description: status.node.description,
        branch: status.node.branch,
        tier: status.node.tier,
        requires: status.node.requires,
        cost: status.cost,
        purchased: status.purchased,
        unlocked: status.unlocked,
        affordable: status.affordable,
        blockedBy: status.blockedBy,
        x: at?.x ?? 0,
        y: at?.y ?? 0,
        effects: status.node.effects,
      }
    })
    game.treeRefund = refundValue(saveData)
    // `import.meta.env.DEV` so the view can be reviewed before Phase 26 makes
    // Recollection obtainable and Phase 32 supplies the boss that reveals it.
    // Stripped from a production build, where the authored gate is the only
    // way in — economy-spec.md §3.
    game.treeRevealed = isTreeRevealed(saveData) || import.meta.env.DEV
    game.recollection = saveData.meta.recollection
  }

  game.treeActions = {
    purchase(nodeId: string) {
      if (!purchaseNode(saveData, nodeId)) return
      publishTree()
      autosaver.request('purchase')
    },
    respec() {
      // "Only between runs" is this layer's check to make — `upgradeTree.ts`
      // deliberately cannot see whether a stage is in progress.
      if (game.running) return
      respecTree(saveData)
      publishTree()
      autosaver.request('purchase')
    },
    preview(nodeId: string) {
      const path = pathTo(saveData, nodeId)
      return {
        ids: path.steps.map((step) => step.node.id),
        total: path.total,
        affordable: path.affordable,
      }
    },
  }

  publishTree()

  /**
   * Push the roster and the fielded formation to the view.
   *
   * On change rather than per frame — the roster moves a handful of times per
   * run, and rebuilding it every frame would allocate arrays sixty times a
   * second to show numbers that do not move.
   */
  const publishRoster = (): void => {
    game.movementRoster = rosterOf(saveData, 'movement')
    game.chimeRoster = rosterOf(saveData, 'chime')

    const movementLevels = levelsOf(saveData, 'movement')
    game.fielded = Object.entries(saveData.run.formation).map(([key, defId]) => {
      const [ring, slot] = key.split(':').map(Number)
      return {
        ring,
        slot,
        defId,
        name: movementById(defId)?.name ?? defId,
        level: movementLevels[defId] ?? 1,
      }
    })

    const chimeLevels = levelsOf(saveData, 'chime')
    game.mounted = Object.entries(saveData.run.mounts).map(([mount, defId]) => ({
      ring: 0,
      slot: Number(mount),
      defId,
      name: chimeById(defId)?.name ?? defId,
      level: chimeLevels[defId] ?? 1,
    }))

    game.nextSlotCost = nextSlotCost(saveData)
    game.nextMountCost = nextMountCost(saveData)
    game.presetNames = saveData.meta.presets.map((p) => p.name)
    game.keys = saveData.meta.keys
  }

  /**
   * Reconcile the live field with the saved formation.
   *
   * A **diff**, not a rebuild. Tearing the formation down and re-creating it
   * would reset HP and cooldowns, which turns re-slotting into a free heal
   * mid-wave. Only what actually changed is touched, so units that stayed put
   * keep the damage they have taken.
   */
  const syncFieldToSave = (): void => {
    const sim = simulation.state

    for (const movement of [...sim.movements]) {
      const key = `${movement.slot.ring}:${movement.slot.slot}`
      if (saveData.run.formation[key] !== movement.def.id) {
        removeMovement(sim, movement.slot.ring, movement.slot.slot)
      }
    }
    for (const chime of [...sim.chimes]) {
      if (saveData.run.mounts[String(chime.mount)] !== chime.def.id) {
        sim.chimes.splice(sim.chimes.indexOf(chime), 1)
      }
    }

    const movementLevels = levelsOf(saveData, 'movement')
    for (const [key, defId] of Object.entries(saveData.run.formation)) {
      const [ring, slot] = key.split(':').map(Number)
      if (sim.movements.some((m) => m.slot.ring === ring && m.slot.slot === slot)) continue
      const def = movementById(defId)
      if (def) placeMovement(sim, def, ring as RingIndex, slot, movementLevels[defId] ?? 1)
    }

    const chimeLevels = levelsOf(saveData, 'chime')
    for (const [mount, defId] of Object.entries(saveData.run.mounts)) {
      if (sim.chimes.some((c) => c.mount === Number(mount))) continue
      const def = chimeById(defId)
      if (def) mountChime(sim, def, Number(mount), chimeLevels[defId] ?? 1)
    }

    recomputeBonuses(sim)
  }

  /** Apply an edit: persist, reconcile the field, republish. */
  const afterEdit = (refusal: string | null = null): void => {
    game.lastRefusal = refusal
    syncFieldToSave()
    publishRoster()
    publishTree()
    // Publish the balance immediately rather than waiting for the next frame:
    // a price that updates a frame after the click reads as a click that did
    // not register.
    game.publishFilings(saveData.run.filings, simulation.state.elapsed)
    autosaver.request('purchase')
  }

  game.formationActions = {
    place(defId, ring, slot, from) {
      const result = placeSaved(
        saveData,
        defId,
        ring as RingIndex,
        slot,
        from ? { ring: from.ring as RingIndex, slot: from.slot } : undefined,
      )
      afterEdit(result.refusedBecause)
    },
    remove(ring, slot) {
      removeSaved(saveData, ring as RingIndex, slot)
      afterEdit()
    },
    mount(defId, mount) {
      afterEdit(mountSaved(saveData, defId, mount).refusedBecause)
    },
    unmount(mount) {
      unmountSaved(saveData, mount)
      afterEdit()
    },
    unlock(kind, id) {
      afterEdit(unlockUnit(saveData, kind, id) ? null : 'unaffordable')
    },
    levelUp(kind, id) {
      afterEdit(levelUpUnit(saveData, kind, id) ? null : 'unaffordable')
    },
    savePreset(name) {
      afterEdit(savePresetTo(saveData, name) ? null : 'preset-limit')
    },
    loadPreset(name) {
      const result = loadPresetFrom(saveData, name)
      afterEdit(result.skipped.length > 0 ? 'partial' : null)
    },
    deletePreset(name) {
      deletePresetFrom(saveData, name)
      afterEdit()
    },
  }

  publishRoster()

  /**
   * The stage in play. Restored from the save so a reload resumes where the
   * player was rather than sending them back to First Shift.
   */
  let currentStage: StageAddress = saveData.run.currentStage ?? DEFAULT_STAGE
  if (!PLAY_ORDER.includes(currentStage)) currentStage = DEFAULT_STAGE
  saveData.run.currentStage = currentStage

  /** Seconds the clear banner holds before the next stage loads. */
  const STAGE_GAP_SECONDS = 3

  let pendingStage: StageAddress | null = null
  let advanceIn = 0

  let simulation = buildSimulation()
  const renderer: Renderer = await createRenderer(host)

  game.showDiagnostics = saveData.settings.showFps

  const autosaver = new Autosaver(saves, () => saveData, { intervalSeconds: 15 })

  function buildSimulation(): Simulation {
    // Seeded from the stage address, so a stage always plays the same way and
    // a balance observation is reproducible.
    const rng = createRng(seedFrom(currentStage))
    // The tree's aggregate is read once, here. Purchases mid-stage cannot
    // change a run in progress, which is what makes a run reproducible from
    // its seed at all.
    const sim = new Simulation(
      loadStage(currentStage, { effects: currentEffects() }),
      rng,
    )
    fieldFormation(sim, saveData)
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
    // The synergy preview. Not persisted — it is a planning aid you open when
    // you are planning, unlike the diagnostics overlay.
    if (event.key === 'f') game.showFormation = !game.showFormation
    // The tree stays hidden until it is revealed — economy-spec.md §3 wants a
    // first-time player meeting one progression system at a time.
    if (event.key === 't' && game.treeRevealed) game.showTree = !game.showTree
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

  /** The address the loaded stage came from. Ids are stable; objects are not. */
  const stageAddressOf = (state: SimulationState): StageAddress =>
    `${state.zone.id}:${state.stage.id}` as StageAddress

  /**
   * One frame's work, given how much time it covers.
   *
   * Split out of the `requestAnimationFrame` callback so it can be pumped
   * directly — RAF is throttled to nothing in a backgrounded or headless tab,
   * which makes the whole loop unobservable there. The dev handle exposes this.
   */
  const frameStep = (elapsed: number, elapsedMs = elapsed * 1000) => {

    const simStart = performance.now()
    const events = simulation.advance(elapsed)
    const simMs = performance.now() - simStart

    // Bank whatever the stage produced, and tell the autosaver about it.
    //
    // This is the **one** place a tick's events become a currency change.
    // `progression/currencies.ts` holds the rules and the simulation holds the
    // field; neither knows about the other, and this loop is the seam.
    // The Salvage multiplier is applied here rather than in the simulation:
    // `systems/` computes what the field dropped, `progression/` decides what
    // the player banks.
    earnFilings(saveData, events.filingsDropped * (1 + currentEffects().filings))
    if (events.slackKilled > 0) {
      saveData.statistics.totalSlackDestroyed += events.slackKilled
    }
    if (events.conjunctionsFired > 0) {
      saveData.statistics.conjunctionsFired += events.conjunctionsFired
    }

    if (events.stageCleared) {
      const address = stageAddressOf(simulation.state)
      recordDepth(saveData, simulation.state.stage.scalingIndex)

      // Keys are first-clear only, and `applyStageClear` is idempotent — a
      // clear event that somehow fires twice must not pay twice.
      const reward = applyStageClear(saveData, address)
      if (reward.keys > 0) {
        game.lastKeyAward = { keys: reward.keys, zoneCompleted: reward.zoneCompleted }
      }

      // Queue the next stage. Advancing on a timer rather than immediately so
      // the clear banner is readable — a stage that vanished the instant it
      // ended would read as the bug this replaced.
      pendingStage = nextStageAfter(address)
      advanceIn = pendingStage ? STAGE_GAP_SECONDS : 0
      game.nextStageIn = advanceIn
      publishTree()
      autosaver.request('stage-clear')
    }

    // Count down to the next stage. The simulation is stopped, so this runs on
    // the frame clock rather than on simulated time.
    if (advanceIn > 0) {
      advanceIn -= elapsed
      game.nextStageIn = Math.max(0, advanceIn)
      if (advanceIn <= 0 && pendingStage) {
        currentStage = pendingStage
        saveData.run.currentStage = currentStage
        pendingStage = null
        simulation = buildSimulation()
        game.reset()
        autosaver.request('stage-clear')
      }
    }

    saveData.statistics.playtimeSeconds += elapsed
    autosaver.tick(elapsed)

    const renderStart = performance.now()
    renderer.render(simulation)
    const renderMs = performance.now() - renderStart

    // Step 11: publish the projection. The only write into Svelte.
    game.syncFrom(simulation)
    // The permanent currencies live in the save, not the field, so they are
    // published here rather than by `syncFrom`.
    game.recollection = saveData.meta.recollection
    game.keys = saveData.meta.keys
    // The spendable balance lives in the save, not the field. Published here
    // for the same reason as the permanent currencies.
    game.publishFilings(saveData.run.filings, simulation.state.elapsed)
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

  const step = (now: number) => {
    frame = requestAnimationFrame(step)
    const elapsedMs = now - previous
    previous = now
    frameStep(elapsedMs / 1000, elapsedMs)
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
      /** Pump the loop by hand. See `frameStep`. */
      frameStep,
    }
  }

  return session
}
