import { SALVAGE, CLEARANCE, RECOLLECTION } from '../content/economy'
import { isBossStage } from '../systems/scaling'
import { zoneById } from '../content/zones'
import { bossById } from '../content/bosses'
import { unlockReachableZones } from './map'
import { isBossWave } from '../entities/Wave'
import { parseStageAddress, type StageAddress } from '../entities/Zone'
import type { SaveData } from '../core/saveSchema'

export interface TreeBonuses {
  salvage: number
  recollection: number
}

export const NO_TREE_BONUSES: Readonly<TreeBonuses> = Object.freeze({
  salvage: 0,
  recollection: 0,
})

export function salvageDrop(baseDrop: number, zoneIndex: number, tree = NO_TREE_BONUSES): number {
  return baseDrop * (1 + zoneIndex * SALVAGE.zoneScaling) * (1 + tree.salvage)
}

function sinkCost(curve: { base: number; growth: number }, bought: number): number {
  return Math.ceil(curve.base * curve.growth ** Math.max(0, bought))
}

export function slotCost(slotsUsed: number): number {
  return sinkCost(SALVAGE.slot, slotsUsed)
}

export function mountCost(mountsUsed: number): number {
  return sinkCost(SALVAGE.mount, mountsUsed)
}

export function repairCost(repairsThisStage: number, discount = 0): number {
  const full = sinkCost(SALVAGE.repair, repairsThisStage)
  return Math.max(1, Math.ceil(full * (1 - Math.min(0.9, Math.max(0, discount)))))
}

export function reinforceCost(reinforcements: number): number {
  return sinkCost(SALVAGE.reinforce, reinforcements)
}

export const REINFORCE_BONUS = SALVAGE.reinforce.bonus

export function canAfford(save: SaveData, cost: number): boolean {
  return save.run.salvage >= cost
}

export function spendSalvage(save: SaveData, cost: number): boolean {
  if (!canAfford(save, cost)) return false
  save.run.salvage -= cost
  return true
}

export function earnSalvage(save: SaveData, amount: number): void {
  if (amount <= 0) return
  save.run.salvage += amount
  save.statistics.totalSalvageEarned += amount
}

export function recollectionFor(deepestScalingIndex: number, tree = NO_TREE_BONUSES): number {
  if (deepestScalingIndex <= 0) return 0
  const raw =
    deepestScalingIndex ** RECOLLECTION.depthExponent / RECOLLECTION.depthDivisor
  return Math.floor(raw * (1 + tree.recollection))
}

export function minimumRewindDepth(tree = NO_TREE_BONUSES): number {
  for (let depth = 1; depth <= 200; depth++) {
    if (recollectionFor(depth, tree) > 0) return depth
  }
  return Infinity
}

export interface ClearReward {
  clearance: number

  firstClear: boolean

  zoneCompleted: boolean

  bossSalvage: number

  unlockedZones: string[]
}

export function clearReward(save: SaveData, address: StageAddress): ClearReward {
  const none: ClearReward = {
    clearance: CLEARANCE.reclear,
    firstClear: false,
    zoneCompleted: false,
    bossSalvage: 0,
    unlockedZones: [],
  }
  if (save.meta.clearedStages.includes(address)) return none

  const { zoneId } = parseStageAddress(address)
  const zone = zoneById(zoneId)
  if (!zone) return none

  const stage = zone.stages.find((s) => `${zone.id}:${s.id}` === address)
  if (!stage) return none

  const clearance = isBossStage(stage.scalingIndex)
    ? CLEARANCE.bossStageFirstClear
    : CLEARANCE.normalStageFirstClear

  const cleared = new Set(save.meta.clearedStages)
  cleared.add(address)
  const zoneCompleted = zone.stages.every((s) => cleared.has(`${zone.id}:${s.id}` as StageAddress))

  let bossSalvage = 0
  for (const wave of stage.waves) {
    if (!isBossWave(wave)) continue
    bossSalvage += bossById(wave.bossId)?.firstClearSalvage ?? 0
  }

  return {
    clearance: clearance + (zoneCompleted ? CLEARANCE.zoneComplete : 0),
    firstClear: true,
    zoneCompleted,
    bossSalvage,
    unlockedZones: [],
  }
}

export function applyStageClear(save: SaveData, address: StageAddress): ClearReward {
  const reward = clearReward(save, address)
  if (!reward.firstClear) return reward

  save.meta.clearedStages.push(address)
  save.meta.clearance += reward.clearance

  save.run.salvage += reward.bossSalvage

  reward.unlockedZones = unlockReachableZones(save)
  return reward
}

export function recordDepth(save: SaveData, scalingIndex: number): void {
  if (scalingIndex > save.run.deepestScalingIndex) {
    save.run.deepestScalingIndex = scalingIndex
  }
  if (scalingIndex > save.statistics.deepestScalingIndexEver) {
    save.statistics.deepestScalingIndexEver = scalingIndex
  }
}
