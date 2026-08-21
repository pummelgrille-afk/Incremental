import { beforeEach, describe, expect, it } from 'vitest'
import { createDefaultSave } from '../src/lib/core/saveSchema'
import { UPGRADE_NODES, upgradeById } from '../src/lib/content/upgrades'
import { TREE } from '../src/lib/content/economy'
import {
  branchDepth,
  effectsOf,
  isUnlocked,
  nodeCost,
  purchase,
  refundValue,
  respec,
  statusOf,
  isTreeRevealed,
  pathTo,
  treeLayout,
  treeStatus,
  validateTree,
} from '../src/lib/progression/upgradeTree'
import {
  noUpgradeEffects,
  UPGRADE_BRANCHES,
  type UpgradeEffectKind,
  type UpgradeNodeDef,
} from '../src/lib/entities/Upgrade'
import { ZONES } from '../src/lib/content/zones'
import type { SaveData } from '../src/lib/core/saveSchema'
import type { StageAddress } from '../src/lib/entities/Zone'

let save: SaveData

beforeEach(() => {
  save = createDefaultSave(0)
  save.meta.recollection = 1000
})

const node = (id: string) => upgradeById(id)!
const ROOT = 'winding-tension-of-the-stroke'
const SECOND = 'winding-shortened-escape'
const THIRD = 'winding-sympathetic-stroke'

describe('the authored graph', () => {
  it('passes validation', () => {
    expect(validateTree()).toEqual([])
  })

  it('gives every branch a root, or its nodes are unreachable forever', () => {
    for (const branch of UPGRADE_BRANCHES) {
      const inBranch = UPGRADE_NODES.filter((n) => n.branch === branch)
      expect(inBranch.length, branch).toBeGreaterThan(0)
      expect(inBranch.some((n) => n.requires.length === 0), branch).toBe(true)
    }
  })

  it('gives every effect kind at least one live node', () => {
    // A kind with no content using it is untested configuration — the failure
    // mode this project keeps finding. New kinds arrive with their wiring.
    const kinds = new Set<UpgradeEffectKind>()
    for (const n of UPGRADE_NODES) for (const e of n.effects) kinds.add(e.kind)

    for (const key of Object.keys(noUpgradeEffects()) as UpgradeEffectKind[]) {
      expect(kinds.has(key), `no node grants "${key}"`).toBe(true)
    }
  })

  it('keeps Regulation buying reach, not numbers', () => {
    // economy-spec.md §2 asks Phase 34 to protect this identity. Asserting it
    // now means the guard exists before the content does.
    const numeric: UpgradeEffectKind[] = ['attack', 'defence', 'tension', 'haste']
    for (const n of UPGRADE_NODES.filter((x) => x.branch === 'regulation')) {
      for (const effect of n.effects) {
        expect(numeric, `${n.id} grants "${effect.kind}"`).not.toContain(effect.kind)
      }
    }
  })

  it('never grants control over ring rotation', () => {
    // combat-spec.md §1 forbids it outright, including via upgrades — an
    // upgrade re-introducing steering would re-introduce the dexterity problem
    // the Phase 10 playtest found.
    const kinds = UPGRADE_NODES.flatMap((n) => n.effects.map((e) => e.kind))
    expect(kinds.join(' ')).not.toMatch(/ring|rotat|steer|phase/i)
  })

  it('catches a node requiring one from another branch', () => {
    const broken: UpgradeNodeDef[] = [
      { ...node(ROOT) },
      { ...node('bracing-hardened-pallets'), requires: [ROOT] },
    ]
    expect(validateTree(broken).some((p) => p.problem.includes('another branch'))).toBe(true)
  })

  it('catches a prerequisite cycle', () => {
    const a: UpgradeNodeDef = { ...node(ROOT), id: 'a', tier: 2, requires: ['b'] }
    const b: UpgradeNodeDef = { ...node(ROOT), id: 'b', tier: 1, requires: ['a'] }
    expect(validateTree([a, b]).some((p) => p.problem.includes('cycle'))).toBe(true)
  })

  it('catches a node that does nothing', () => {
    const empty: UpgradeNodeDef = { ...node(ROOT), effects: [] }
    expect(validateTree([empty]).some((p) => p.problem.includes('does nothing'))).toBe(true)
  })

  it('catches a prerequisite that is not below it', () => {
    const flat: UpgradeNodeDef[] = [
      { ...node(ROOT), id: 'a', tier: 2, requires: [] },
      { ...node(ROOT), id: 'b', tier: 2, requires: ['a'] },
    ]
    expect(validateTree(flat).some((p) => p.problem.includes('not below'))).toBe(true)
  })
})

describe('prerequisites', () => {
  it('leaves a root unlocked from the start', () => {
    expect(isUnlocked(save, node(ROOT))).toBe(true)
  })

  it('locks a node until every prerequisite is owned', () => {
    expect(isUnlocked(save, node(SECOND))).toBe(false)
    purchase(save, ROOT)
    expect(isUnlocked(save, node(SECOND))).toBe(true)
  })

  it('refuses to buy a locked node, and takes nothing', () => {
    const before = save.meta.recollection
    expect(purchase(save, SECOND)).toBe(false)
    expect(save.meta.recollection).toBe(before)
    expect(save.meta.purchasedNodes).toEqual([])
  })

  it('reports why a node is blocked', () => {
    expect(statusOf(save, node(SECOND)).blockedBy).toBe('missing-prerequisite')

    purchase(save, ROOT)
    expect(statusOf(save, node(ROOT)).blockedBy).toBe('purchased')

    save.meta.recollection = 0
    expect(statusOf(save, node(SECOND)).blockedBy).toBe('unaffordable')
  })

  it('reports nothing blocking a node that can be bought now', () => {
    expect(statusOf(save, node(ROOT)).blockedBy).toBeNull()
  })
})

describe('cost', () => {
  it('charges the base price for the first node in a branch', () => {
    expect(nodeCost(save, node(ROOT))).toBe(node(ROOT).baseCost)
  })

  it('grows with how deep the branch already is, not the whole tree', () => {
    // Spreading investment is cheaper than driving one branch deep: a
    // specialist build pays for the privilege rather than being handed it.
    purchase(save, ROOT)
    const afterOwnBranch = nodeCost(save, node(SECOND))

    const other = createDefaultSave(0)
    other.meta.recollection = 1000
    purchase(other, 'bracing-deeper-winding')
    const afterOtherBranch = nodeCost(other, node(SECOND))

    expect(afterOwnBranch).toBeGreaterThan(afterOtherBranch)
    expect(afterOtherBranch).toBe(node(SECOND).baseCost)
  })

  it('follows the authored growth exactly', () => {
    purchase(save, ROOT)
    expect(branchDepth(save, 'winding')).toBe(1)
    expect(nodeCost(save, node(SECOND))).toBe(
      Math.ceil(node(SECOND).baseCost * TREE.nodeCostGrowth),
    )
  })

  it('refuses a node the player cannot afford, and takes nothing', () => {
    save.meta.recollection = 1
    expect(purchase(save, ROOT)).toBe(false)
    expect(save.meta.recollection).toBe(1)
  })

  it('deducts exactly the quoted cost', () => {
    const quoted = statusOf(save, node(ROOT)).cost
    const before = save.meta.recollection

    expect(purchase(save, ROOT)).toBe(true)
    expect(save.meta.recollection).toBe(before - quoted)
  })

  it('will not buy the same node twice', () => {
    purchase(save, ROOT)
    const before = save.meta.recollection

    expect(purchase(save, ROOT)).toBe(false)
    expect(save.meta.recollection).toBe(before)
    expect(save.meta.purchasedNodes).toEqual([ROOT])
  })

  it('ignores an unknown id rather than throwing', () => {
    expect(purchase(save, 'no-such-node')).toBe(false)
  })
})

describe('respec', () => {
  it('is free — it returns exactly what was spent', () => {
    // economy-spec.md §2: charging for a respec would punish experimenting with
    // formations, which is the game's main pleasure.
    const before = save.meta.recollection
    purchase(save, ROOT)
    purchase(save, SECOND)
    purchase(save, 'bracing-deeper-winding')

    const refund = respec(save)
    expect(save.meta.recollection).toBe(before)
    expect(refund).toBeGreaterThan(0)
  })

  it('clears every purchase', () => {
    purchase(save, ROOT)
    purchase(save, SECOND)
    respec(save)

    expect(save.meta.purchasedNodes).toEqual([])
    expect(effectsOf(save)).toEqual(noUpgradeEffects())
  })

  it('refunds nothing for an empty tree', () => {
    expect(refundValue(save)).toBe(0)
    expect(respec(save)).toBe(0)
  })

  it('lets a player rebuild the same tree for the same price', () => {
    // The round trip has to be exactly neutral, or repeated respeccing becomes
    // either a leak or a tax.
    purchase(save, ROOT)
    purchase(save, SECOND)
    purchase(save, THIRD)
    const spent = save.meta.recollection

    respec(save)
    purchase(save, ROOT)
    purchase(save, SECOND)
    purchase(save, THIRD)

    expect(save.meta.recollection).toBe(spent)
  })
})

describe('effects', () => {
  it('is neutral for an untouched save', () => {
    expect(effectsOf(save)).toEqual(noUpgradeEffects())
  })

  it('sums rather than multiplies across nodes', () => {
    // Across ~72 nodes multiplicative stacking compounds past any curve
    // balancing.csv can hold — the same reason economy-spec §7 caps the type
    // matrix at 1.5x.
    purchase(save, ROOT)
    const one = effectsOf(save).attack
    expect(one).toBe(node(ROOT).effects[0].magnitude)
  })

  it('accumulates across branches independently', () => {
    purchase(save, ROOT)
    purchase(save, 'bracing-deeper-winding')
    purchase(save, 'salvage-swarf-discipline')
    purchase(save, 'regulation-second-beat')

    const effects = effectsOf(save)
    expect(effects.attack).toBeGreaterThan(0)
    expect(effects.tension).toBeGreaterThan(0)
    expect(effects.filings).toBeGreaterThan(0)
    expect(effects.beatCharges).toBe(1)
  })

  it('skips an unknown id rather than throwing', () => {
    // A save must survive content changing between versions; a node removed in
    // Phase 34 must not make an old save unloadable.
    save.meta.purchasedNodes.push('removed-in-a-later-version')
    expect(() => effectsOf(save)).not.toThrow()
    expect(effectsOf(save)).toEqual(noUpgradeEffects())
  })
})

describe('the tree view', () => {
  it('reports a status for every authored node', () => {
    expect(treeStatus(save)).toHaveLength(UPGRADE_NODES.length)
  })

  it('marks exactly the roots as available on a fresh save', () => {
    const available = treeStatus(save).filter((s) => s.blockedBy === null)
    expect(available).toHaveLength(UPGRADE_BRANCHES.length)
    for (const status of available) {
      expect(status.node.requires).toEqual([])
    }
  })
})

describe('the path preview', () => {
  it('quotes nothing for a node already owned', () => {
    purchase(save, ROOT)
    expect(pathTo(save, ROOT).steps).toEqual([])
    expect(pathTo(save, ROOT).total).toBe(0)
  })

  it('lists prerequisites before the node that needs them', () => {
    const path = pathTo(save, THIRD)
    expect(path.steps.map((s) => s.node.id)).toEqual([ROOT, SECOND, THIRD])
  })

  it('costs more than the sum of current prices', () => {
    /*
     * The whole reason this lives in the backend. Each purchase raises its
     * branch's depth, so quoting the sum of today's prices under-quotes every
     * multi-step path — the one thing a planning affordance must not do.
     */
    const naive = [ROOT, SECOND, THIRD].reduce((sum, id) => sum + nodeCost(save, node(id)), 0)
    expect(pathTo(save, THIRD).total).toBeGreaterThan(naive)
  })

  it('walks the branch curve exactly', () => {
    const g = TREE.nodeCostGrowth
    const expected =
      Math.ceil(node(ROOT).baseCost) +
      Math.ceil(node(SECOND).baseCost * g) +
      Math.ceil(node(THIRD).baseCost * g ** 2)

    expect(pathTo(save, THIRD).total).toBe(expected)
  })

  it('shortens as prerequisites are bought', () => {
    const full = pathTo(save, THIRD)
    purchase(save, ROOT)
    const remaining = pathTo(save, THIRD)

    expect(remaining.steps).toHaveLength(full.steps.length - 1)
    expect(remaining.steps.map((s) => s.node.id)).toEqual([SECOND, THIRD])
  })

  it('never changes the save it was asked about', () => {
    // Asking the question must not change the answer.
    const before = JSON.stringify(save.meta)
    pathTo(save, THIRD)
    expect(JSON.stringify(save.meta)).toBe(before)
  })

  it('reports affordability against the whole path, not one node', () => {
    save.meta.recollection = node(ROOT).baseCost
    const path = pathTo(save, THIRD)

    expect(path.total).toBeGreaterThan(save.meta.recollection)
    expect(path.affordable).toBe(false)
  })

  it('reports nothing for an unknown id', () => {
    expect(pathTo(save, 'no-such-node').steps).toEqual([])
  })
})

describe('the layout', () => {
  it('places every node exactly once', () => {
    const layout = treeLayout()
    expect(layout).toHaveLength(UPGRADE_NODES.length)
    expect(new Set(layout.map((l) => l.nodeId)).size).toBe(UPGRADE_NODES.length)
  })

  it('pushes later tiers further from the centre', () => {
    const at = new Map(treeLayout().map((l) => [l.nodeId, l]))
    const radius = (id: string) => Math.hypot(at.get(id)!.x, at.get(id)!.y)

    expect(radius(SECOND)).toBeGreaterThan(radius(ROOT))
    expect(radius(THIRD)).toBeGreaterThan(radius(SECOND))
  })

  it('gives each branch its own quadrant', () => {
    // Branches must not overlap, or the tree stops reading as four arms once
    // Phase 34 grows it to seventy-two nodes.
    const bearings = new Map<string, number[]>()
    for (const l of treeLayout()) {
      const list = bearings.get(l.branch) ?? []
      list.push(Math.atan2(l.y, l.x))
      bearings.set(l.branch, list)
    }

    const spans = [...bearings.entries()].map(([branch, angles]) => ({
      branch,
      min: Math.min(...angles),
      max: Math.max(...angles),
    }))

    for (const a of spans) {
      for (const b of spans) {
        if (a.branch === b.branch) continue
        const overlaps = a.min <= b.max && b.min <= a.max
        expect(overlaps, `${a.branch} overlaps ${b.branch}`).toBe(false)
      }
    }
  })

  it('never places a node on the origin', () => {
    // The centre is reserved, and a node there would sit under the labels.
    for (const l of treeLayout()) {
      expect(Math.hypot(l.x, l.y), l.nodeId).toBeGreaterThan(50)
    }
  })
})

describe('the reveal gate', () => {
  it('hides the tree on a fresh save', () => {
    // economy-spec.md §3: a first-time player meets one system at a time.
    expect(isTreeRevealed(save)).toBe(false)
  })

  it('stays hidden after clearing ordinary stages', () => {
    for (const stage of ZONES[0].stages) {
      save.meta.clearedStages.push(`${ZONES[0].id}:${stage.id}` as StageAddress)
    }
    expect(isTreeRevealed(save)).toBe(false)
  })

  it('reveals after a Rewind', () => {
    save.meta.rewindCount = 1
    expect(isTreeRevealed(save)).toBe(true)
  })

  it('ignores a cleared stage that no longer exists', () => {
    save.meta.clearedStages.push('gone:missing' as StageAddress)
    expect(() => isTreeRevealed(save)).not.toThrow()
    expect(isTreeRevealed(save)).toBe(false)
  })
})
