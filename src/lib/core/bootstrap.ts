import { platformById, PLATFORMS } from '../content/platforms'
import { arrayById, ARRAYS } from '../content/arrays'
import { STARTING_ZONE_ID, ZONES } from '../content/zones'
import { game } from '../stores/game.svelte'
import { applyStageClear, earnSalvage, recordDepth } from '../progression/currencies'
import { isRewindUnlocked, rewind as rewindRun, rewindPreview } from '../progression/prestige'
import {
  calculateOffline,
  isWorthReporting,
  updateEarningRate,
} from '../systems/offlineProgress'
import { evaluate as evaluateAchievements } from '../progression/achievements'
import { evaluate as evaluateTutorial } from '../progression/tutorial'
import type { TutorialEvent } from '../entities/Tutorial'
import {
  buyTrack,
  supportRoster,
  supportStats,
  SUPPORT_TRACKS,
  type SupportTrack,
} from '../progression/support'
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
  mountArray as mountSaved,
  nextMountCost,
  nextSlotCost,
  placePlatform as placeSaved,
  removePlatform as removeSaved,
  savePreset as savePresetTo,
  unmountArray as unmountSaved,
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
  mountArray,
  placePlatform,
  recomputeBonuses,
  removePlatform,
} from './formation'
import { MAX_CATCHUP_SECONDS, Simulation } from './loop'
import { createRenderer, type Renderer } from './render'
import { createRng, seedFrom } from './rng'
import { SaveManager } from './save'
import type { SaveData } from './saveSchema'
import { loadStage, stageOrder } from './stageLoader'
import { isStageUnlocked, mapView } from '../progression/map'
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
 * nothing — which is correct now that Salvage buy slots: an empty field is the
 * honest starting state, not a bug.
 */
function fieldFormation(simulation: Simulation, save: SaveData): void {
  applyFormation(
    simulation.state,
    save.run.formation,
    platformById,
    levelsOf(save, 'platform'),
  )

  const arrayLevels = levelsOf(save, 'array')
  for (const [mount, defId] of Object.entries(save.run.mounts)) {
    const def = arrayById(defId)
    if (!def) continue
    // Silently skip a mount that no longer exists, for the same reason
    // `applyFormation` skips a missing Platform: a save must survive content
    // changing, and refusing to load would be worse than a missing unit.
    try {
      mountArray(
        simulation.state,
        def,
        Number(mount),
        arrayLevels[defId] ?? 1,
        supportStats(save, def),
      )
    } catch {
      continue
    }
  }
}

export async function startGame(host: HTMLElement): Promise<GameSession> {
  const saves = new SaveManager()
  const loaded = saves.load()
  let saveData: SaveData = loaded.data

  /*
   * Declared before anything that might reach it.
   *
   * It used to sit further down, next to the simulation it saves alongside,
   * and `checkAchievements('load')` — which runs during startup — could reach
   * it first. That is a temporal dead zone, and a conditional one: the call
   * only touches the autosaver when something is *newly* earned, so it fired
   * for a returning player whose save already qualified and never for a fresh
   * one. Both the tests and every browser check used fresh saves.
   */
  const autosaver = new Autosaver(saves, () => saveData, { intervalSeconds: 15 })

  grantStartingLoadout(saveData)

  /**
   * Settle an absence, and report it if it was long enough to be worth saying.
   *
   * Called for two kinds of absence, because from the player's side they are
   * the same absence:
   *
   *   1. The game was closed. Elapsed time is `now - savedAt`, known exactly
   *      once, which is why this runs as a single transaction at startup
   *      rather than from the frame loop.
   *   2. **The tab was left open in the background.** This one paid nothing at
   *      all before: `requestAnimationFrame` is throttled to a stop in a hidden
   *      tab, so the simulation does not run, and offline progress was only
   *      ever calculated at startup — so the commonest way to idle an idle game
   *      produced no Salvage and no summary.
   */
  const settleAbsence = (elapsedSeconds: number): void => {
    const offline = calculateOffline({
      elapsedSeconds,
      salvagePerSecond: saveData.run.salvagePerSecond,
      effects: effectsOf(saveData),
    })
    if (!isWorthReporting(offline)) return

    earnSalvage(saveData, offline.salvage)
    game.offlineSummary = {
      elapsedSeconds: offline.effectiveSeconds + offline.wastedSeconds,
      effectiveSeconds: offline.effectiveSeconds,
      wastedSeconds: offline.wastedSeconds,
      salvage: Math.floor(offline.salvage),
      capSeconds: offline.capSeconds,
      efficiency: offline.efficiency,
      activeEquivalent: Math.floor(offline.activeEquivalent),
    }
  }

  settleAbsence((Date.now() - saveData.savedAt) / 1000)

  if (loaded.notices.length > 0) {
    console.info('[perihelion] save notices:', loaded.notices)
  }

  /**
   * The tree's aggregate, recomputed only when a purchase changes it.
   *
   * `effectsOf` walks every purchased node, and the frame loop reads it for the
   * Recovery multiplier — a per-frame walk of ~72 ids to produce a number that
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
    // Same dev allowance as the tree, and for the same reason: Phase 32 owns
    // the boss that opens this, so it is otherwise unreachable to review.
    game.rewindUnlocked = isRewindUnlocked(saveData) || import.meta.env.DEV
    game.rewindPreview = rewindPreview(saveData, game.rewindUnlocked)
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
  /**
   * The progression map, and the address of the stage in play.
   *
   * Republished on a clear and whenever the panel opens rather than every
   * frame: it is forty stages across six zones and none of it changes between
   * clears, so rebuilding it per frame would be forty allocations a frame for a
   * panel that is usually shut.
   */
  const publishMap = (): void => {
    game.map = mapView(saveData)
    game.currentStage = currentStage
  }

  /**
   * The Clearance balance the roster's affordability was last computed for.
   *
   * `rosterOf` bakes `canUnlock` and `canLevel` in at publish time, and the
   * roster is only published on edits — so Clearance awarded by a stage clear
   * left every buy button disabled until some *unrelated* edit happened to
   * republish it. The currency was spendable; the panel had not been told.
   */
  let publishedClearance = -1

  const publishRoster = (): void => {
    publishedClearance = saveData.meta.clearance
    game.platformRoster = rosterOf(saveData, 'platform')
    game.arrayRoster = rosterOf(saveData, 'array')

    const platformLevels = levelsOf(saveData, 'platform')
    game.fielded = Object.entries(saveData.run.formation).map(([key, defId]) => {
      const [ring, slot] = key.split(':').map(Number)
      return {
        ring,
        slot,
        defId,
        name: platformById(defId)?.name ?? defId,
        level: platformLevels[defId] ?? 1,
      }
    })

    const arrayLevels = levelsOf(saveData, 'array')
    game.mounted = Object.entries(saveData.run.mounts).map(([mount, defId]) => ({
      ring: 0,
      slot: Number(mount),
      defId,
      name: arrayById(defId)?.name ?? defId,
      level: arrayLevels[defId] ?? 1,
    }))

    game.nextSlotCost = nextSlotCost(saveData)
    game.nextMountCost = nextMountCost(saveData)
    game.presetNames = saveData.meta.presets.map((p) => p.name)
    game.supportRoster = supportRoster(saveData)
    game.clearance = saveData.meta.clearance
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

    for (const platform of [...sim.platforms]) {
      const key = `${platform.slot.ring}:${platform.slot.slot}`
      if (saveData.run.formation[key] !== platform.def.id) {
        removePlatform(sim, platform.slot.ring, platform.slot.slot)
      }
    }
    for (const array of [...sim.arrays]) {
      if (saveData.run.mounts[String(array.mount)] !== array.def.id) {
        sim.arrays.splice(sim.arrays.indexOf(array), 1)
      }
    }

    const platformLevels = levelsOf(saveData, 'platform')
    for (const [key, defId] of Object.entries(saveData.run.formation)) {
      const [ring, slot] = key.split(':').map(Number)
      if (sim.platforms.some((m) => m.slot.ring === ring && m.slot.slot === slot)) continue
      const def = platformById(defId)
      if (def) placePlatform(sim, def, ring as RingIndex, slot, platformLevels[defId] ?? 1)
    }

    const arrayLevels = levelsOf(saveData, 'array')
    for (const [mount, defId] of Object.entries(saveData.run.mounts)) {
      if (sim.arrays.some((c) => c.mount === Number(mount))) continue
      const def = arrayById(defId)
      if (def) mountArray(sim, def, Number(mount), arrayLevels[defId] ?? 1, supportStats(saveData, def))
    }

    recomputeBonuses(sim)
  }

  /** Apply an edit: persist, reconcile the field, republish. */
  const afterEdit = (refusal: string | null = null): void => {
    game.lastRefusal = refusal
    syncFieldToSave()
    publishRoster()
  publishMap()
    publishTree()
    // Publish the balance immediately rather than waiting for the next frame:
    // a price that updates a frame after the click reads as a click that did
    // not register.
    game.publishSalvage(saveData.run.salvage, simulation.state.elapsed)
    autosaver.request('purchase')
  }

  /**
   * Evaluate achievements for a moment, and queue anything newly earned.
   *
   * Queued rather than shown directly: several can land on the same tick — a
   * first clear that was also untouched, say — and a toast that replaced its
   * predecessor would silently swallow one.
   */
  const checkAchievements = (
    event: Parameters<typeof evaluateAchievements>[1],
    snapshot: Parameters<typeof evaluateAchievements>[2] = {},
  ): void => {
    const earned = evaluateAchievements(saveData, event, snapshot)
    if (earned.length === 0) return

    game.achievementQueue = [
      ...game.achievementQueue,
      ...earned.map((a) => ({ id: a.id, name: a.name, description: a.description })),
    ]
    autosaver.request('purchase')
  }

  /**
   * Raise the next onboarding card, if one is due.
   *
   * Evaluated on the same moments as achievements, and for the same reason —
   * these questions change a handful of times per run. At most one card is
   * raised per moment; `progression/tutorial.ts` owns which.
   *
   * The two gates are read from `progression/` rather than from the store,
   * which widens both in a dev build: a card announcing the Almanac to a
   * player who cannot yet reach it would be worse than no card at all.
   */
  const checkTutorial = (event: TutorialEvent, largestConjunction = 0): void => {
    const step = evaluateTutorial(saveData, event, {
      nextSlotCost: nextSlotCost(saveData),
      largestConjunction,
      treeRevealed: isTreeRevealed(saveData),
      rewindWorthwhile:
        isRewindUnlocked(saveData) && rewindPreview(saveData).award > 0,
    })
    if (!step) return

    game.tutorialQueue = [
      ...game.tutorialQueue,
      {
        id: step.id,
        name: step.name,
        description: step.description,
        key: step.key,
      },
    ]
    autosaver.request('purchase')
  }

  /** The parts of a moment the triggers read. */
  const achievementSnapshot = () => ({
    distinctPlatformsSlotted: new Set(Object.values(saveData.run.formation)).size,
    unlockedPlatforms: Object.keys(saveData.meta.platforms).length,
  })

  game.prestigeActions = {
    rewind() {
      if (!rewindRun(saveData, Date.now(), game.rewindUnlocked).rewound) return

      // The run is gone, so the simulation that was playing it must go too.
      currentStage = DEFAULT_STAGE
      saveData.run.currentStage = currentStage
      pendingStage = null
      advanceIn = 0
      simulation = buildSimulation()

      checkAchievements('rewind')
      game.reset()
      game.showPrestige = false
      publishRoster()
      publishTree()
      autosaver.flush('purchase')
    },
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
    buyTrack(defId, track) {
      // The store types the track as a string so `stores/` need not import
      // from `progression/`; the guard is what makes that safe.
      if (!(SUPPORT_TRACKS as readonly string[]).includes(track)) return
      afterEdit(buyTrack(saveData, defId, track as SupportTrack) ? null : 'unaffordable')
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
  // Before the first frame, not on it. The loop is what usually publishes the
  // balance, and it does not run in a backgrounded tab — so a save with a
  // healthy balance showed zero Salvage until the tab was looked at.
  game.primeSalvage(saveData.run.salvage)

  // State-shaped triggers — "has cleared a stage", "has Rewound" — need one
  // evaluation on load, or a save from before this phase would never earn them.
  checkAchievements('load')
  checkTutorial('load')

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

  // --- Input: the Flare is the entire live control surface. ------------------
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
    // The progression map. Always available: it is where a player finds out
    // there is anything past the zone they are on.
    if (event.key === 'm') {
      publishMap()
      game.showMap = !game.showMap
    }
    // The tree stays hidden until it is revealed — economy-spec.md §3 wants a
    // first-time player meeting one progression system at a time.
    if (event.key === 't' && game.treeRevealed) game.showTree = !game.showTree
    if (event.key === 'p' && game.rewindUnlocked) game.showPrestige = !game.showPrestige
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

  /** Wall-clock time the tab was hidden, or null while it is on screen. */
  let hiddenAt: number | null = null

  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now()
      onHide()
      return
    }

    if (hiddenAt === null) return
    const away = (Date.now() - hiddenAt) / 1000
    hiddenAt = null

    settleAbsence(away)
    publishRoster()
    game.primeSalvage(saveData.run.salvage)

    /*
     * Restart the frame clock.
     *
     * `previous` is only written by the RAF callback, so after a throttled
     * absence the first frame back would otherwise be handed hours of elapsed
     * time. The simulation clamps that (MAX_CATCHUP_SECONDS), but the earning
     * rate and the playtime statistic are computed from the raw figure — and
     * an hour-long frame drove `salvagePerSecond` to nearly zero, which is
     * precisely the number the next absence is paid from.
     */
    previous = performance.now()
    autosaver.request('purchase')
  }
  document.addEventListener('visibilitychange', onVisibilityChange)

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
    // The Recovery multiplier is applied here rather than in the simulation:
    // `systems/` computes what the field dropped, `progression/` decides what
    // the player banks.
    earnSalvage(saveData, events.salvageDropped * (1 + currentEffects().salvage))
    if (events.contactKilled > 0) {
      saveData.statistics.totalContactsDestroyed += events.contactKilled
    }
    if (events.conjunctionsFired > 0) {
      saveData.statistics.conjunctionsFired += events.conjunctionsFired
      checkAchievements('conjunction', {
        largestConjunction: events.largestConjunction,
      })
      checkTutorial('conjunction', events.largestConjunction)
    }

    if (events.stageLost) {
      checkAchievements('stage-lost', achievementSnapshot())
      checkTutorial('stage-lost')
    }

    if (events.stageCleared) {
      const address = stageAddressOf(simulation.state)
      recordDepth(saveData, simulation.state.stage.scalingIndex)

      // Clearance is first-clear only, and `applyStageClear` is idempotent — a
      // clear event that somehow fires twice must not pay twice.
      const reward = applyStageClear(saveData, address)
      if (reward.clearance > 0) {
        game.lastClearanceAward = { clearance: reward.clearance, zoneCompleted: reward.zoneCompleted }
      }
      // A clear can open a zone; the map has to say so before the player next
      // opens it, not on the following frame.
      publishMap()

      // Queue the next stage. Advancing on a timer rather than immediately so
      // the clear banner is readable — a stage that vanished the instant it
      // ended would read as the bug this replaced.
      checkAchievements('stage-cleared', {
        ...achievementSnapshot(),
        clearedUntouched: simulation.state.sun.lowestFraction >= 1,
        zoneCompleted: reward.zoneCompleted,
      })

      checkTutorial('stage-cleared')

      pendingStage = nextStageAfter(address)
      advanceIn = pendingStage ? STAGE_GAP_SECONDS : 0
      game.nextStageIn = advanceIn
      publishTree()
      autosaver.request('stage-clear')
    }

    /*
     * A stage picked from the map.
     *
     * Consumed here rather than acted on by the store, which is a projection
     * and must never reach into the simulation. Re-validated against the save
     * rather than trusted: the panel disables locked stages, but a disabled
     * button is a presentation detail and the rule lives in progression/.
     */
    if (game.requestedStage) {
      const requested = game.requestedStage as StageAddress
      game.requestedStage = null
      // Close on any accepted pick, including the stage already in play.
      // Leaving the panel open there reads as a click that did not register.
      if (isStageUnlocked(saveData, requested)) game.showMap = false
      if (isStageUnlocked(saveData, requested) && requested !== currentStage) {
        currentStage = requested
        saveData.run.currentStage = currentStage
        pendingStage = null
        advanceIn = 0
        game.nextStageIn = 0
        simulation = buildSimulation()
        game.reset()
        publishMap()
        autosaver.request('stage-clear')
      }
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

    /*
     * The rate offline progress will be scaled from.
     *
     * A slow exponential average rather than a lifetime mean: the player's
     * earning power changes as they buy slots, and a lifetime figure would
     * still be reporting their first minute an hour later. The window is long
     * enough that a wave gap does not read as a collapse in output.
     */
    /*
     * Both figures below measure *simulated* time, not wall-clock time.
     *
     * `advance` runs at most MAX_CATCHUP_SECONDS of simulation per call, so a
     * frame that covers an hour still only plays half a second of it. Billing
     * the hour to either of these was wrong in the same way twice: the playtime
     * statistic counted time nobody played — its own doc comment says offline
     * time is not counted — and the earning rate divided half a second of drops
     * by an hour, which is the rate the *next* absence is then paid at. One
     * backgrounded tab was enough to make offline progress pay nothing
     * thereafter. See `updateEarningRate`.
     */
    const simulated = Math.min(elapsed, MAX_CATCHUP_SECONDS)

    if (game.running) {
      saveData.run.salvagePerSecond = updateEarningRate(
        saveData.run.salvagePerSecond,
        events.salvageDropped,
        simulated,
      )
    }

    saveData.statistics.playtimeSeconds += simulated
    autosaver.tick(elapsed)

    const renderStart = performance.now()
    renderer.render(simulation)
    const renderMs = performance.now() - renderStart

    // Step 11: publish the projection. The only write into Svelte.
    game.syncFrom(simulation)
    // The permanent currencies live in the save, not the field, so they are
    // published here rather than by `syncFrom`.
    game.recollection = saveData.meta.recollection
    game.clearance = saveData.meta.clearance
    // The spendable balance lives in the save, not the field. Published here
    // for the same reason as the permanent currencies.
    game.publishSalvage(saveData.run.salvage, simulation.state.elapsed)

    // Clearance can arrive from a stage clear, which is not an edit — so the
    // roster has to be told, or what it says is affordable goes stale.
    if (saveData.meta.clearance !== publishedClearance) {
      publishedClearance = saveData.meta.clearance
      publishRoster()
    }
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
      document.removeEventListener('visibilitychange', onVisibilityChange)
      autosaver.flush('shutdown')
      renderer.destroy()
    },
  }

  if (import.meta.env.DEV) {
    // Dev handle for profiling without requestAnimationFrame, which is
    // throttled in backgrounded and headless tabs. Phase 11 formalises this.
    ;(window as unknown as Record<string, unknown>).__perihelion = {
      get simulation() {
        return simulation
      },
      renderer,
      session,
      content: { PLATFORMS, ARRAYS },
      /** Pump the loop by hand. See `frameStep`. */
      frameStep,
    }
  }

  return session
}
