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
import {
  evaluate as evaluateTutorial,
  replayTutorial,
} from '../progression/tutorial'
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
import { MAX_CATCHUP_SECONDS, noTickEvents, Simulation } from './loop'
import { syncFieldToSave } from './fieldSync'
import { UPGRADE_BURST, UPGRADE_COLOUR } from '../content/effects'
import { platformPosition } from '../systems/ai'
import { createAudio, type AudioEngine } from './audio'
import { createRenderer, type Renderer } from './render'
import { actionFor, isBindable, normaliseBindings, strokeToBinding } from './keybindings'
import { DEFAULT_BINDINGS, type ActionId } from '../content/keybindings'
import { deepestContactPoint } from '../systems/ai'
import { createRng, seedFrom } from './rng'
import { SaveImportError, SaveManager } from './save'
import { translate } from '../i18n/translate'
import { useLocale } from '../stores/i18n.svelte'
import type { SaveData } from './saveSchema'
import { loadStage, stageOrder } from './stageLoader'
import { isStageUnlocked, mapView } from '../progression/map'
import type { StageAddress } from '../entities/Zone'
import type { RingIndex } from '../entities/types'
import type { SimulationState } from './simulation'

const DEFAULT_STAGE: StageAddress = `${STARTING_ZONE_ID}:first-shift`

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

  const autosaver = new Autosaver(saves, () => saveData, { intervalSeconds: 15 })

  grantStartingLoadout(saveData)

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

  let effects = effectsOf(saveData)
  let effectsVersion = saveData.meta.purchasedNodes.length

  const currentEffects = () => {
    if (saveData.meta.purchasedNodes.length !== effectsVersion) {
      effectsVersion = saveData.meta.purchasedNodes.length
      effects = effectsOf(saveData)
    }
    return effects
  }

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

    game.treeRevealed = isTreeRevealed(saveData) || import.meta.env.DEV

    game.rewindUnlocked = isRewindUnlocked(saveData) || import.meta.env.DEV
    game.rewindPreview = rewindPreview(saveData, game.rewindUnlocked)
    game.recollection = saveData.meta.recollection
  }

  game.treeActions = {
    purchase(nodeId: string) {
      if (!purchaseNode(saveData, nodeId)) return
      pendingAcknowledgements.push(null)
      audio.play('purchase')
      publishTree()
      autosaver.request('purchase')
    },
    respec() {
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

  const publishMap = (): void => {
    game.map = mapView(saveData)
    game.currentStage = currentStage
  }

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

  const afterEdit = (refusal: string | null = null): void => {
    game.lastRefusal = refusal
    syncFieldToSave(simulation.state, saveData)
    publishRoster()
    publishMap()
    publishTree()

    game.publishSalvage(saveData.run.salvage, simulation.state.elapsed)
    autosaver.request('purchase')
  }

  const checkAchievements = (
    event: Parameters<typeof evaluateAchievements>[1],
    snapshot: Parameters<typeof evaluateAchievements>[2] = {},
  ): void => {
    const earned = evaluateAchievements(saveData, event, snapshot)
    if (earned.length === 0) return

    audio.play('achievement')
    game.achievementQueue = [
      ...game.achievementQueue,
      ...earned.map((a) => ({ id: a.id, name: a.name, description: a.description })),
    ]
    autosaver.request('purchase')
  }

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

  const showManual = (): void => {
    audio.play('manualOpen')
    game.tutorialQueue = replayTutorial(saveData).map((step) => ({
      id: step.id,
      name: step.name,
      description: step.description,
      key: step.key,
    }))
    autosaver.request('purchase')
  }

  const pendingAcknowledgements: (string | null)[] = []

  let lastTutorialCards = 0

  const playAcknowledgements = (): void => {
    if (pendingAcknowledgements.length === 0) return
    if (game.showFormation || game.showTree || game.showMap || game.showPrestige) return

    const sim = simulation.state

    for (const defId of pendingAcknowledgements) {
      const targets =
        defId === null ? [] : sim.platforms.filter((p) => p.def.id === defId)
      const points =
        targets.length > 0
          ? targets.map((platform) => platformPosition(sim, platform))
          : [{ x: 0, y: 0 }]

      for (const point of points) {
        sim.particles.burst({
          x: point.x,
          y: point.y,
          angle: 0,
          count: UPGRADE_BURST.count,
          spread: UPGRADE_BURST.spread,
          speed: UPGRADE_BURST.speed,
          life: UPGRADE_BURST.life,
          size: UPGRADE_BURST.size,
          drag: UPGRADE_BURST.drag,
          colour: UPGRADE_COLOUR,
        })
      }
    }

    pendingAcknowledgements.length = 0
  }

  const achievementSnapshot = () => ({
    distinctPlatformsSlotted: new Set(Object.values(saveData.run.formation)).size,
    unlockedPlatforms: Object.keys(saveData.meta.platforms).length,
  })

  game.stageActions = {
    standDown() {
      pendingStage = null
      advanceIn = 0
      simulation = buildSimulation()
      game.reset()
      simulation.state.phase = 'standby'
      game.syncFrom(simulation)

      game.paused = false
      autosaver.request('purchase')
    },

    begin() {
      if (simulation.state.phase !== 'standby') return
      simulation.state.phase = 'wave-active'
      game.paused = false
      game.syncFrom(simulation)
    },
  }

  game.prestigeActions = {
    rewind() {
      if (!rewindRun(saveData, Date.now(), game.rewindUnlocked).rewound) return

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
      const levelled = levelUpUnit(saveData, kind, id)
      if (levelled) audio.play('purchase')
      if (levelled && kind === 'platform') pendingAcknowledgements.push(id)
      afterEdit(levelled ? null : 'unaffordable')
    },
    buyTrack(defId, track) {
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

  game.primeSalvage(saveData.run.salvage)

  checkAchievements('load')
  checkTutorial('load')

  let currentStage: StageAddress = saveData.run.currentStage ?? DEFAULT_STAGE
  if (!PLAY_ORDER.includes(currentStage)) currentStage = DEFAULT_STAGE
  saveData.run.currentStage = currentStage

  const STAGE_GAP_SECONDS = 3

  let pendingStage: StageAddress | null = null
  let advanceIn = 0

  let simulation = buildSimulation()
  const renderer: Renderer = await createRenderer(host)

  const audio: AudioEngine = createAudio(saveData.settings)

  game.showDiagnostics = saveData.settings.showFps

  const publishSettings = (): void => {
    const s = saveData.settings

    game.settings = {
      masterVolume: s.masterVolume,
      musicVolume: s.musicVolume,
      sfxVolume: s.sfxVolume,
      screenShake: s.screenShake,
      reducedMotion: s.reducedMotion,
      colourblindPalette: s.colourblindPalette,
      textScale: s.textScale,
      showFps: s.showFps,
      locale: s.locale,
    }
    game.keybindings = { ...s.keybindings }
    game.showDiagnostics = s.showFps

    useLocale(s.locale)

    audio.applySettings(s)
    renderer.applySettings({
      colourblindPalette: s.colourblindPalette,
      screenShake: s.screenShake,
      reducedMotion: s.reducedMotion,
    })
  }

  game.settingsActions = {
    set(key, value) {
      ;(saveData.settings[key] as unknown) = value
      publishSettings()
      autosaver.request('settings')
    },

    bind(action, binding) {
      saveData.settings.keybindings = normaliseBindings({
        ...saveData.settings.keybindings,
        [action]: binding,
      })
      publishSettings()
      autosaver.request('settings')
    },

    resetBindings() {
      saveData.settings.keybindings = { ...DEFAULT_BINDINGS }
      publishSettings()
      autosaver.request('settings')
    },

    beginRebind(action) {
      pendingRebind = action
      game.rebinding = action
    },

    exportSave() {
      autosaver.flush('manual')
      return saves.exportString(saveData)
    },

    importSave(text) {
      try {
        saves.importString(text)
      } catch (error) {
        if (error instanceof SaveImportError) return translate(error.key, error.params)
        return error instanceof Error ? error.message : String(error)
      }

      window.location.reload()
      return null
    },
  }

  publishSettings()

  publishMap()

  function buildSimulation(): Simulation {
    const rng = createRng(seedFrom(currentStage))

    const sim = new Simulation(
      loadStage(currentStage, { effects: currentEffects() }),
      rng,
    )
    fieldFormation(sim, saveData)
    return sim
  }

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return
    audio.resume()
    const world = renderer.toWorld(event.clientX, event.clientY)
    if (simulation.strike(world.x, world.y)) audio.play('flare')
  }

  const isTyping = (target: EventTarget | null): boolean => {
    const element = target as HTMLElement | null
    if (!element) return false
    const tag = element.tagName
    return tag === 'INPUT' || tag === 'TEXTAREA' || element.isContentEditable
  }

  const closeTopmost = (): boolean => {
    if (game.tutorialQueue.length > 0) {
      game.tutorialQueue = game.tutorialQueue.slice(1)
      return true
    }
    if (game.offlineSummary !== null) {
      game.offlineSummary = null
      return true
    }

    const screens = [
      'showSettings',
      'showMenu',
      'showPrestige',
      'showMap',
      'showTree',
      'showFormation',
    ] as const

    for (const key of screens) {
      if (game[key]) {
        game[key] = false
        return true
      }
    }
    return false
  }

  const runAction = (action: ActionId): boolean => {
    switch (action) {
      case 'menu':

        if (!closeTopmost()) game.showMenu = true
        return true

      case 'pause':
        game.paused = !game.paused
        audio.play('ui')
        return true

      case 'flare': {
        const point = deepestContactPoint(simulation.state)
        if (point && simulation.strike(point.x, point.y)) audio.play('flare')
        return true
      }

      case 'restart':
        session.restart()
        return true

      case 'formation':
        game.showFormation = !game.showFormation
        audio.play('ui')
        return true

      case 'map':
        game.showMap = !game.showMap
        audio.play('ui')
        return true

      case 'tree':
        if (game.treeRevealed) game.showTree = !game.showTree
        return true

      case 'rewind':
        if (game.rewindUnlocked) game.showPrestige = !game.showPrestige
        return true

      case 'manual':
        showManual()
        return true

      case 'diagnostics':

        saveData.settings.showFps = !saveData.settings.showFps
        publishSettings()
        autosaver.request('settings')
        return true

      default:
        return false
    }
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (isTyping(event.target)) return

    if (pendingRebind) {
      event.preventDefault()
      const stroke = strokeOf(event)
      if (stroke.code === 'Escape') pendingRebind = null
      else if (isBindable(stroke)) {
        game.settingsActions?.bind(pendingRebind, strokeToBinding(stroke))
        pendingRebind = null
      }
      game.rebinding = pendingRebind
      return
    }

    const action = actionFor(strokeOf(event), saveData.settings.keybindings)
    if (action === null) return

    audio.resume()

    if (runAction(action)) event.preventDefault()
  }

  const strokeOf = (event: KeyboardEvent) => ({
    code: event.code,
    ctrl: event.ctrlKey,
    alt: event.altKey,
    meta: event.metaKey,
  })

  let pendingRebind: ActionId | null = null

  host.addEventListener('pointerdown', onPointerDown)

  window.addEventListener('keydown', onKeyDown, { capture: true })

  const onHide = () => autosaver.flush('shutdown')
  window.addEventListener('beforeunload', onHide)

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

    previous = performance.now()
    autosaver.request('purchase')
  }
  document.addEventListener('visibilitychange', onVisibilityChange)

  let previous = performance.now()
  let frame = 0
  let fpsAccumulator = 0
  let fpsFrames = 0

  const stageAddressOf = (state: SimulationState): StageAddress =>
    `${state.zone.id}:${state.stage.id}` as StageAddress

  const frameStep = (elapsed: number, elapsedMs = elapsed * 1000) => {
    const paused = game.paused

    const simStart = performance.now()
    const events = paused ? noTickEvents() : simulation.advance(elapsed)
    const simMs = performance.now() - simStart

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

    if (events.contactHits > 0) audio.play('hit')
    if (events.contactKilled > 0) audio.play('kill')
    if (events.sunHits > 0) audio.play('sunHit')

    if (events.stageLost) {
      audio.play('lost')
      checkAchievements('stage-lost', achievementSnapshot())
      checkTutorial('stage-lost')
    }

    if (events.stageCleared) {
      audio.play('cleared')
      const address = stageAddressOf(simulation.state)
      recordDepth(saveData, simulation.state.stage.scalingIndex)

      const reward = applyStageClear(saveData, address)
      if (reward.clearance > 0) {
        game.lastClearanceAward = { clearance: reward.clearance, zoneCompleted: reward.zoneCompleted }
      }

      publishMap()

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

    if (game.manualRequested) {
      game.manualRequested = false
      showManual()
    }

    if (game.requestedStage) {
      const requested = game.requestedStage as StageAddress
      game.requestedStage = null

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

    const simulated = Math.min(elapsed, MAX_CATCHUP_SECONDS)

    const sun = simulation.state.sun
    audio.update({
      dt: paused ? 0 : simulated,
      contacts: simulation.state.contact.length,
      outputFraction: sun.maxHp > 0 ? sun.hp / sun.maxHp : 0,
      running: game.running,
    })

    if (game.running && !paused) {
      saveData.run.salvagePerSecond = updateEarningRate(
        saveData.run.salvagePerSecond,
        events.salvageDropped,
        simulated,
      )
    }

    if (!paused) saveData.statistics.playtimeSeconds += simulated
    autosaver.tick(elapsed)

    if (game.tutorialQueue.length < lastTutorialCards) audio.play('pageTurn')
    lastTutorialCards = game.tutorialQueue.length

    playAcknowledgements()

    const renderStart = performance.now()
    renderer.render(simulation, elapsed)
    const renderMs = performance.now() - renderStart

    game.syncFrom(simulation)

    game.recollection = saveData.meta.recollection
    game.clearance = saveData.meta.clearance

    game.publishSalvage(saveData.run.salvage, simulation.state.elapsed)

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
      window.removeEventListener('keydown', onKeyDown, { capture: true })
      window.removeEventListener('beforeunload', onHide)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      autosaver.flush('shutdown')
      audio.destroy()
      renderer.destroy()
    },
  }

  if (import.meta.env.DEV) {
    ;(window as unknown as Record<string, unknown>).__perihelion = {
      get simulation() {
        return simulation
      },
      renderer,

      audio,
      session,
      content: { PLATFORMS, ARRAYS },

      frameStep,
    }
  }

  return session
}
