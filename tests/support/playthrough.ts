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

/**
 * A full-game playthrough harness.
 *
 * Phase 35 asks for "end-to-end playthroughs across multiple prestige loops",
 * and there is no way to answer that from unit tests: the question is whether a
 * *player* — buying slots, levelling units, spending Recollection, dying,
 * rewinding — tracks the cadence economy-spec.md §3 authors.
 *
 * This drives the **real** systems throughout. It buys through
 * `progression/`, fields through `core/formation`, and fights on the real
 * `Simulation` at the real tick rate. Nothing about the economy or the combat
 * is modelled a second time here, because a balance harness that approximates
 * the thing it is balancing measures its own approximation.
 *
 * The one thing it does model is **the player**, and that model is deliberately
 * simple and stated: spend on the cheapest useful thing, always. A real player
 * plays better than this, so every number it produces is a floor.
 */

export interface StageResult {
  address: StageAddress
  scalingIndex: number
  cleared: boolean
  seconds: number
  outputLeft: number
  /** Real drops, summed from the simulation's own tick events. */
  salvage: number
}

export interface RunResult {
  /** 1-based. */
  rewindNumber: number
  deepestScalingIndex: number
  stagesCleared: number
  /** Simulated seconds of combat, excluding menus. */
  seconds: number
  salvageEarned: number
  recollectionAwarded: number
  nodesOwned: number
  slots: number
  mounts: number
  stages: StageResult[]
}

/** Every stage, in play order. A run walks this from the start. */
const LADDER: StageAddress[] = ZONES.flatMap((z) =>
  z.stages.map((st) => `${z.id}:${st.id}` as StageAddress),
)

/** Seconds of real time a player spends per stage outside combat. */
const OVERHEAD_PER_STAGE = 8

/** Give up on a stage that has plainly stalled rather than running forever. */
const STAGE_TIMEOUT_SECONDS = 300

/**
 * Spend Salvage on the cheapest thing that makes the field stronger.
 *
 * Order matters and is the model's only real opinion: a slot beats a level,
 * because a body that did not exist contributes more than a body that already
 * did. Mounts come last — combat-spec.md §4 prices an Array above a Platform
 * deliberately, and a greedy buyer should feel that.
 */
function spendSalvageGreedily(save: SaveData): void {
  for (let guard = 0; guard < 200; guard++) {
    /*
     * Candidates, cheapest first, and **fall through** when the cheapest one
     * cannot be taken.
     *
     * The first draft picked the cheaper of slot and mount and gave up if that
     * one failed. Once the slot price passed the mount price at six slots the
     * modelled player preferred a mount, owned no Array to mount, and stopped
     * buying anything at all — sitting on 1,600 Salvage for the rest of the
     * game. It looked exactly like an economy that had run dry.
     *
     * `placePlatform` and `mountArray` charge for themselves; an earlier draft
     * also called `spendSalvage` first and paid twice for every slot.
     */
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

/**
 * What to put in the next slot.
 *
 * **Not the highest-DPS unit.** The first draft fielded whatever had the best
 * attack-per-second, which meant the entire formation became Rakes the moment
 * Rake was unlocked for 3 Clearance — 45 HP, 2 defence and the narrowest block
 * arc in the roster. The field stopped intercepting anything, the Sun ate every
 * projectile, and measured depth *fell* as the player got richer. That was the
 * harness playing badly, not the economy failing, and it made every number the
 * harness produced meaningless until it was fixed.
 *
 * It is also a real finding about the game: block arc carries survivability, so
 * a DPS-maximising build is a trap. combat-spec.md §5 intends exactly that.
 *
 * The policy now fields a rotation — a tank, then damage, then damage — so
 * every third body is something that actually blocks. A real player does better
 * than this; it is a floor, not a ceiling.
 */
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

/**
 * Spend Clearance on roster breadth first, then depth.
 *
 * Breadth first because economy-spec.md §1 says that is what Clearance is for,
 * and because a second damage type answers matchups that no amount of levelling
 * on one unit will.
 */
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
      // Everything owned: put the rest into levels.
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

/** Spend Recollection on the cheapest available node, repeatedly. */
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

/** Field the save's formation onto a fresh simulation. */
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
  /** Strike with the Flare whenever a charge is banked. Default true. */
  useFlare?: boolean
  seed?: number

  /**
   * Called after each stage resolves, with the save as it stands.
   *
   * Exists so Phase 36 can trace **when** an onboarding card would fire during
   * a real first run rather than asserting the triggers against a save built by
   * hand. A hand-built save proves the predicate; only the harness proves the
   * pacing, which is the part a tutorial can get wrong.
   *
   * Called after the clear has been recorded, so a hook asking "has a second
   * zone opened" sees the answer the player would.
   */
  onStageResolved?: (save: SaveData, result: StageResult) => void
}

/** Play one stage to a clear or a loss. */
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
    /*
     * The Flare, used the way the design assumes it is: on cooldown, at the
     * densest point on the field. Measuring without it tunes the game for a
     * player who never touches the controls, which Phase 20 already found once.
     */
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

/** The Contact with the most neighbours inside a Flare radius. */
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

/** Play one run to its first loss, spending as it goes. */
export function playRun(save: SaveData, rewindNumber: number, options: PlayOptions = {}): RunResult {
  const stages: StageResult[] = []
  let seconds = 0
  const salvageBefore = save.run.salvage

  /*
   * A run climbs the ladder from the beginning.
   *
   * The first draft jumped straight to the deepest *uncleared* stage, because
   * a Rewind keeps stage access (economy-spec.md §3). It died instantly every
   * time, and correctly: access survives a Rewind but Salvage does not, so a
   * player restarts each run with four Bolts and no bank. Re-treading opened
   * stages is not re-earning access, it is rebuilding the formation — and it
   * is the only way anyone reaches depth at all.
   *
   * Cleared stages still award no Clearance, so nothing here is farmable.
   */
  for (const address of LADDER) {
    // Spend before entering, the way a player does between stages.
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

/** Play `count` runs, rewinding between them. */
export function playCampaign(count: number, options: PlayOptions = {}): RunResult[] {
  const save = createDefaultSave(0)
  grantStartingLoadout(save)

  const runs: RunResult[] = []
  for (let i = 1; i <= count; i++) {
    runs.push(playRun(save, i, options))

    // Rewind, then spend what it awarded.
    rewind(save, 0, true)
    spendRecollection(save)
    grantStartingLoadout(save)
  }
  return runs
}
