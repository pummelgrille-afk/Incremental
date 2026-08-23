import { beforeEach, describe, expect, it } from 'vitest'
import { createDefaultSave } from '../src/lib/core/saveSchema'
import { recollectionFor } from '../src/lib/progression/currencies'
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

const ROOT = 'aperture-force-of-the-pulse'
const SECOND = 'aperture-deeper-charge'
const THIRD = 'aperture-full-bore'

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
    const kinds = new Set<UpgradeEffectKind>()
    for (const n of UPGRADE_NODES) for (const e of n.effects) kinds.add(e.kind)

    for (const key of Object.keys(noUpgradeEffects()) as UpgradeEffectKind[]) {
      expect(kinds.has(key), `no node grants "${key}"`).toBe(true)
    }
  })

  it('keeps Regulation buying reach, not numbers', () => {
    const numeric: UpgradeEffectKind[] = ['attack', 'defence', 'output', 'haste']
    for (const n of UPGRADE_NODES.filter((x) => x.branch === 'regulation')) {
      for (const effect of n.effects) {
        expect(numeric, `${n.id} grants "${effect.kind}"`).not.toContain(effect.kind)
      }
    }
  })

  it('never grants control over ring rotation', () => {
    const kinds = UPGRADE_NODES.flatMap((n) => n.effects.map((e) => e.kind))
    expect(kinds.join(' ')).not.toMatch(/ring|rotat|steer|phase/i)
  })

  it('catches a node requiring one from another branch', () => {
    const broken: UpgradeNodeDef[] = [
      { ...node(ROOT) },
      { ...node('shielding-hardened-plating'), requires: [ROOT] },
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
    purchase(save, ROOT)
    const afterOwnBranch = nodeCost(save, node(SECOND))

    const other = createDefaultSave(0)
    other.meta.recollection = 1000
    purchase(other, 'shielding-deeper-reserves')
    const afterOtherBranch = nodeCost(other, node(SECOND))

    expect(afterOwnBranch).toBeGreaterThan(afterOtherBranch)
    expect(afterOtherBranch).toBe(node(SECOND).baseCost)
  })

  it('follows the authored growth exactly', () => {
    purchase(save, ROOT)
    expect(branchDepth(save, 'aperture')).toBe(1)
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
    const before = save.meta.recollection
    purchase(save, ROOT)
    purchase(save, SECOND)
    purchase(save, 'shielding-deeper-reserves')

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
    purchase(save, ROOT)
    const one = effectsOf(save).attack
    expect(one).toBe(node(ROOT).effects[0].magnitude)
  })

  it('accumulates across branches independently', () => {
    purchase(save, ROOT)
    purchase(save, 'shielding-deeper-reserves')
    purchase(save, 'recovery-debris-discipline')
    purchase(save, 'regulation-second-flare')

    const effects = effectsOf(save)
    expect(effects.attack).toBeGreaterThan(0)
    expect(effects.output).toBeGreaterThan(0)
    expect(effects.salvage).toBeGreaterThan(0)
    expect(effects.flareCharges).toBe(1)
  })

  it('skips an unknown id rather than throwing', () => {
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
    const statuses = treeStatus(save)
    const available = statuses.filter((s) => s.blockedBy === null)
    const roots = statuses.filter((s) => s.node.requires.length === 0)

    expect(available.map((s) => s.node.id).sort()).toEqual(
      roots.map((s) => s.node.id).sort(),
    )

    for (const branch of UPGRADE_BRANCHES) {
      expect(
        available.some((s) => s.node.branch === branch),
        `${branch} has no root`,
      ).toBe(true)
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

  it('keeps constellation drift clear of a collision', () => {
    const layout = treeLayout()
    let closest = Infinity
    let pair = ''

    for (let i = 0; i < layout.length; i++) {
      for (let j = i + 1; j < layout.length; j++) {
        const distance = Math.hypot(layout[i].x - layout[j].x, layout[i].y - layout[j].y)
        if (distance < closest) {
          closest = distance
          pair = `${layout[i].nodeId} / ${layout[j].nodeId}`
        }
      }
    }

    expect(closest, pair).toBeGreaterThan(30)
  })

  it('scatters nodes off their tier radius', () => {
    const layout = treeLayout()
    const radii = layout.map((l) => Math.round(Math.hypot(l.x, l.y)))

    expect(new Set(radii).size).toBeGreaterThan(layout.length * 0.8)
  })

  it('never places a node on the origin', () => {
    for (const l of treeLayout()) {
      expect(Math.hypot(l.x, l.y), l.nodeId).toBeGreaterThan(50)
    }
  })
})

describe('the reveal gate', () => {
  it('hides the tree on a fresh save', () => {
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

describe('the full Almanac', () => {
  it('matches the shape economy-spec.md authors', () => {
    const counts = new Map<string, number>()
    const tiers = new Map<string, number>()
    for (const n of UPGRADE_NODES) {
      counts.set(n.branch, (counts.get(n.branch) ?? 0) + 1)
      tiers.set(n.branch, Math.max(tiers.get(n.branch) ?? 0, n.tier))
    }

    expect(UPGRADE_NODES.length).toBe(72)
    expect(counts.get('aperture')).toBe(22)
    expect(counts.get('shielding')).toBe(20)
    expect(counts.get('recovery')).toBe(16)
    expect(counts.get('regulation')).toBe(14)

    expect(tiers.get('aperture')).toBe(6)
    expect(tiers.get('shielding')).toBe(6)
    expect(tiers.get('recovery')).toBe(5)
    expect(tiers.get('regulation')).toBe(5)
  })

  it('has no duplicate names and says something in every one', () => {
    const names = UPGRADE_NODES.map((n) => n.name)
    expect(new Set(names).size, 'two nodes share a name').toBe(names.length)
    for (const n of UPGRADE_NODES) {
      expect(n.description.length, n.id).toBeGreaterThan(20)
      expect(n.effects.length, `${n.id} does nothing`).toBeGreaterThan(0)
    }
  })

  it('fills every tier of every branch', () => {
    for (const branch of UPGRADE_BRANCHES) {
      const depth = Math.max(...UPGRADE_NODES.filter((n) => n.branch === branch).map((n) => n.tier))
      for (let tier = 1; tier <= depth; tier++) {
        expect(
          UPGRADE_NODES.some((n) => n.branch === branch && n.tier === tier),
          `${branch} has no tier ${tier}`,
        ).toBe(true)
      }
    }
  })

  it('prices deeper tiers higher', () => {
    for (const branch of UPGRADE_BRANCHES) {
      const byTier = new Map<number, number>()
      for (const n of UPGRADE_NODES.filter((x) => x.branch === branch)) {
        byTier.set(n.tier, Math.max(byTier.get(n.tier) ?? 0, n.baseCost))
      }
      const tiers = [...byTier.keys()].sort((a, b) => a - b)
      for (let i = 1; i < tiers.length; i++) {
        expect(
          byTier.get(tiers[i])!,
          `${branch} tier ${tiers[i]} is not dearer than ${tiers[i - 1]}`,
        ).toBeGreaterThan(byTier.get(tiers[i - 1])!)
      }
    }
  })

  it('gives every branch more than one way in', () => {
    for (const branch of UPGRADE_BRANCHES) {
      const roots = UPGRADE_NODES.filter((n) => n.branch === branch && n.requires.length === 0)
      expect(roots.length, `${branch} has ${roots.length} roots`).toBeGreaterThan(1)
    }
  })

  it('never points a prerequisite at another branch', () => {
    const byId = new Map(UPGRADE_NODES.map((n) => [n.id, n]))
    for (const n of UPGRADE_NODES) {
      for (const req of n.requires) {
        expect(byId.get(req)?.branch, `${n.id} -> ${req}`).toBe(n.branch)
      }
    }
  })
})

describe('branch identities', () => {
  const kindsIn = (branch: string) =>
    new Set(UPGRADE_NODES.filter((n) => n.branch === branch).flatMap((n) => n.effects.map((e) => e.kind)))

  it('keeps Regulation to reach and readability, never numbers', () => {
    const forbidden = ['attack', 'haste', 'defence', 'output', 'salvage', 'recollection']
    for (const kind of kindsIn('regulation')) {
      expect(forbidden, `regulation grants ${kind}`).not.toContain(kind)
    }
  })

  it('keeps each branch to the levers economy-spec.md assigns it', () => {
    expect([...kindsIn('aperture')].sort()).toEqual(['attack', 'conjunctionPotency', 'haste'])
    expect([...kindsIn('shielding')].sort()).toEqual(['blockArc', 'defence', 'output'])
    expect([...kindsIn('recovery')].sort()).toEqual([
      'offlineCap',
      'offlineEfficiency',
      'recollection',
      'repairCost',
      'salvage',
    ])
  })

  it('grants no more than three extra Flare charges in total', () => {
    const total = UPGRADE_NODES.filter((n) => n.branch === 'regulation')
      .flatMap((n) => n.effects)
      .filter((e) => e.kind === 'flareCharges')
      .reduce((sum, e) => sum + e.magnitude, 0)
    expect(total).toBeLessThanOrEqual(3)
  })

  it('cannot drive the Flare recharge to nothing', () => {
    const total = UPGRADE_NODES.flatMap((n) => n.effects)
      .filter((e) => e.kind === 'flareRecharge')
      .reduce((sum, e) => sum + e.magnitude, 0)
    expect(total).toBeLessThan(1)
  })
})

describe('the tree against the prestige curve', () => {
  it('affords something on the very first Rewind', () => {
    const first = createDefaultSave(0)
    first.meta.recollection = recollectionFor(8, { recollection: 0 })
    expect(first.meta.recollection).toBeGreaterThan(0)

    const affordable = treeStatus(first).filter(
      (s) => s.blockedBy === null && nodeCost(first, s.node) <= first.meta.recollection,
    )
    expect(affordable.length, 'nothing is buyable on a first Rewind').toBeGreaterThan(0)
  })

  it('is a loadout rather than a completion list', () => {
    const save = createDefaultSave(0)
    save.meta.recollection = 1200

    for (;;) {
      const options = treeStatus(save)
        .filter((s) => s.blockedBy === null)
        .map((s) => ({ id: s.node.id, cost: nodeCost(save, s.node) }))
        .sort((a, b) => a.cost - b.cost)
      if (!options[0] || options[0].cost > save.meta.recollection) break
      if (!purchase(save, options[0].id)) break
    }

    const owned = save.meta.purchasedNodes.length
    expect(owned, `owned ${owned} of ${UPGRADE_NODES.length}`).toBeGreaterThan(10)
    expect(owned, `owned ${owned} of ${UPGRADE_NODES.length}`).toBeLessThan(
      UPGRADE_NODES.length / 2,
    )
  })
})
