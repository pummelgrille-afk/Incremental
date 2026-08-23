import { Simulation, TICK_SECONDS } from '../../src/lib/core/loop'
import { loadStage } from '../../src/lib/core/stageLoader'
import { createRng, seedFrom } from '../../src/lib/core/rng'
import { applyFormation, mountArray as fieldMountArray } from '../../src/lib/core/formation'
import { createDefaultSave, type SaveData } from '../../src/lib/core/saveSchema'
import { PLATFORMS, platformById } from '../../src/lib/content/platforms'
import { ARRAYS, arrayById } from '../../src/lib/content/arrays'
import { RINGS } from '../../src/lib/content/field'
import { FLARE } from '../../src/lib/content/field'
import {
  applyStageClear,
  recollectionFor,
  recordDepth,
} from '../../src/lib/progression/currencies'
import {
  grantStartingLoadout,
  mountArray,
  nextMountCost,
  nextSlotCost,
  placePlatform,
  slotsUsed,
} from '../../src/lib/progression/loadout'
import { levelCost, levelUp, unlock, unlockCost } from '../../src/lib/progression/roster'
import { effectsOf, nodeCost, purchase, treeStatus } from '../../src/lib/progression/upgradeTree'
import { rewind } from '../../src/lib/progression/prestige'
import { ZONES } from '../../src/lib/content/zones'
import { levelsOf } from '../../src/lib/progression/roster'
import type { RingIndex } from '../../src/lib/entities/types'
import type { StageAddress } from '../../src/lib/entities/Zone'

export interface StageResult {
  address: StageAddress
  scalingIndex: number
  cleared: boolean
  seconds: number
  outputLeft: number

  salvage: number
}

export interface RunResult {
  rewindNumber: number
  deepestScalingIndex: number
  stagesCleared: number

  seconds: number
  salvageEarned: number
  recollectionAwarded: number
  nodesOwned: number
  slots: number
  mounts: number
  stages: StageResult[]
}

const LADDER: StageAddress[] = ZONES.flatMap((z) =>
  z.stages.map((st) => `${z.id}:${st.id}` as StageAddress),
)

const OVERHEAD_PER_STAGE = 8

const STAGE_TIMEOUT_SECONDS = 300

function spendSalvageGreedily(save: SaveData): void {
  for (let guard = 0; guard < 200; guard++) {
    const candidates: { cost: number; buy: () => boolean }[] = []

    const slotAt = openSlot(save)
    if (slotAt) {
      candidates.push({
        cost: nextSlotCost(save),
        buy: () =>
          placePlatform(save, nextPlatformFor(save, slotsUsed(save)), slotAt[0], slotAt[1])
            .placed,
      })
    }

    const mountAt = openMount(save)
    const array = ownedArray(save)
    if (mountAt !== null && array) {
      candidates.push({
        cost: nextMountCost(save),
        buy: () => mountArray(save, array, mountAt).placed,
      })
    }

    candidates.sort((a, b) => a.cost - b.cost)
    if (!candidates.some((c) => c.buy())) break
  }
}

function nextPlatformFor(save: SaveData, slotIndex: number): string {
  const owned = PLATFORMS.filter((p) => save.meta.platforms[p.id])
  if (owned.length === 0) return PLATFORMS[0].id

  const byBlock = [...owned].sort((a, b) => b.blockArc * b.maxHp - a.blockArc * a.maxHp)
  const byDamage = [...owned]
    .filter((p) => p.attack > 0)
    .sort((a, b) => b.attack / b.baseInterval - a.attack / a.baseInterval)

  const tank = byBlock[0]
  const damage = byDamage[0] ?? byBlock[0]
  const second = byDamage[1] ?? damage

  return [tank, damage, second][slotIndex % 3].id
}

function ownedArray(save: SaveData): string | null {
  const owned = ARRAYS.filter((a) => save.meta.arrays[a.id])
  return owned[0]?.id ?? null
}

function openSlot(save: SaveData): [RingIndex, number] | null {
  for (const ring of RINGS) {
    for (let s = 0; s < ring.slots; s++) {
      if (!save.run.formation[`${ring.index}:${s}`]) return [ring.index as RingIndex, s]
    }
  }
  return null
}

function openMount(save: SaveData): number | null {
  for (let m = 0; m < 8; m++) if (!save.run.mounts[String(m)]) return m
  return null
}

function spendClearance(save: SaveData): void {
  for (let guard = 0; guard < 200; guard++) {
    let best: { kind: 'platform' | 'array'; id: string; cost: number; unlock: boolean } | null =
      null

    for (const def of PLATFORMS) {
      if (save.meta.platforms[def.id]) continue
      const cost = unlockCost('platform', def.id)
      if (!best || cost < best.cost) best = { kind: 'platform', id: def.id, cost, unlock: true }
    }
    for (const def of ARRAYS) {
      if (save.meta.arrays[def.id]) continue
      const cost = unlockCost('array', def.id)
      if (!best || cost < best.cost) best = { kind: 'array', id: def.id, cost, unlock: true }
    }

    if (!best) {
      for (const def of PLATFORMS) {
        if (!save.meta.platforms[def.id]) continue
        const cost = levelCost(save, 'platform', def.id)
        if (cost === null) continue
        if (!best || cost < best.cost) best = { kind: 'platform', id: def.id, cost, unlock: false }
      }
    }

    if (!best || best.cost > save.meta.clearance) break
    const ok = best.unlock
      ? unlock(save, best.kind, best.id)
      : levelUp(save, best.kind, best.id)
    if (!ok) break
  }
}

function spendRecollection(save: SaveData): void {
  for (let guard = 0; guard < 200; guard++) {
    const options = treeStatus(save)
      .filter((s) => s.blockedBy === null)
      .map((s) => ({ id: s.node.id, cost: nodeCost(save, s.node) }))
      .sort((a, b) => a.cost - b.cost)
    const best = options[0]
    if (!best || best.cost > save.meta.recollection) break
    if (!purchase(save, best.id)) break
  }
}

function fieldFormation(sim: Simulation, save: SaveData): void {
  applyFormation(
    sim.state,
    save.run.formation,
    (id) => platformById(id),
    levelsOf(save, 'platform'),
  )
  const arrayLevels = levelsOf(save, 'array')
  for (const [mount, id] of Object.entries(save.run.mounts)) {
    const def = arrayById(id)
    if (def) fieldMountArray(sim.state, def, Number(mount), arrayLevels[id] ?? 1)
  }
}

export interface PlayOptions {
  useFlare?: boolean
  seed?: number

  onStageResolved?: (save: SaveData, result: StageResult) => void
}

export function playStage(
  save: SaveData,
  address: StageAddress,
  options: PlayOptions = {},
): StageResult {
  const { useFlare = true, seed } = options
  const sim = new Simulation(
    loadStage(address, { effects: effectsOf(save) }),
    createRng(seed ?? seedFrom(address)),
  )
  fieldFormation(sim, save)

  let t = 0
  let salvage = 0
  for (; t < STAGE_TIMEOUT_SECONDS / TICK_SECONDS; t++) {
    if (useFlare && sim.state.flare.charge >= 1 && sim.state.flare.cooldown <= 0) {
      const target = densestPoint(sim)
      if (target) sim.strike(target.x, target.y)
    }

    const events = sim.tick(TICK_SECONDS)
    salvage += events.salvageDropped
    if (sim.state.phase === 'cleared' || sim.state.phase === 'overwhelmed') break
  }

  return {
    address,
    scalingIndex: sim.state.stage.scalingIndex,
    cleared: sim.state.phase === 'cleared',
    seconds: t * TICK_SECONDS,
    outputLeft: Math.max(0, sim.state.sun.hp) / sim.state.sun.maxHp,
    salvage,
  }
}

function densestPoint(sim: Simulation): { x: number; y: number } | null {
  const contacts = sim.state.contact
  if (contacts.length === 0) return null

  const radius = FLARE.radius + sim.state.effects.flareRadius
  let best = contacts[0]
  let bestCount = -1
  for (const c of contacts) {
    let n = 0
    for (const o of contacts) {
      const dx = o.position.x - c.position.x
      const dy = o.position.y - c.position.y
      if (dx * dx + dy * dy <= radius * radius) n++
    }
    if (n > bestCount) {
      bestCount = n
      best = c
    }
  }
  return { x: best.position.x, y: best.position.y }
}

export function playRun(save: SaveData, rewindNumber: number, options: PlayOptions = {}): RunResult {
  const stages: StageResult[] = []
  let seconds = 0
  const salvageBefore = save.run.salvage

  for (const address of LADDER) {
    spendClearance(save)
    spendSalvageGreedily(save)

    const result = playStage(save, address, options)
    stages.push(result)
    seconds += result.seconds + OVERHEAD_PER_STAGE
    save.run.salvage += result.salvage

    if (!result.cleared) {
      options.onStageResolved?.(save, result)
      break
    }

    recordDepth(save, result.scalingIndex)
    applyStageClear(save, address)
    options.onStageResolved?.(save, result)
  }

  const deepest = save.run.deepestScalingIndex
  return {
    rewindNumber,
    deepestScalingIndex: deepest,
    stagesCleared: stages.filter((s) => s.cleared).length,
    seconds,
    salvageEarned: save.run.salvage - salvageBefore,
    recollectionAwarded: recollectionFor(deepest, { recollection: effectsOf(save).recollection }),
    nodesOwned: save.meta.purchasedNodes.length,
    slots: slotsUsed(save),
    mounts: Object.keys(save.run.mounts).length,
    stages,
  }
}

export function playCampaign(count: number, options: PlayOptions = {}): RunResult[] {
  const save = createDefaultSave(0)
  grantStartingLoadout(save)

  const runs: RunResult[] = []
  for (let i = 1; i <= count; i++) {
    runs.push(playRun(save, i, options))

    rewind(save, 0, true)
    spendRecollection(save)
    grantStartingLoadout(save)
  }
  return runs
}
