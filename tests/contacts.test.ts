import { beforeEach, describe, expect, it } from 'vitest'
import { Simulation, TICK_SECONDS } from '../src/lib/core/loop'
import { loadStage } from '../src/lib/core/stageLoader'
import { createRng } from '../src/lib/core/rng'
import { CONTACT, contactById, contactsOfTier } from '../src/lib/content/contacts'
import { PATTERNS, patternById, MIN_TELEGRAPH_MS } from '../src/lib/systems/patterns'
import { ZONES } from '../src/lib/content/zones'
import { escorted, guarded } from '../src/lib/content/waves'
import { ALL_ARMOUR_CLASSES } from '../src/lib/content/damageTypes'
import { createContact, updateWards } from '../src/lib/systems/spawn'
import { placePlatform } from '../src/lib/core/formation'
import { platformById } from '../src/lib/content/platforms'
import { RINGS } from '../src/lib/content/field'
import { directWave, overLevelBonus } from '../src/lib/systems/scaling'
import { isBossWave } from '../src/lib/entities/Wave'
import { damageContact } from '../src/lib/systems/combat'
import type { ContactInstance, ContactTier } from '../src/lib/entities/Contact'
import type { StageAddress } from '../src/lib/entities/Zone'

const STAGE: StageAddress = 'service-floor:first-shift'
const TIERS: ContactTier[] = ['basic', 'elite', 'specialist']

let sim: Simulation

beforeEach(() => {
  sim = new Simulation(loadStage(STAGE), createRng(1))
  sim.state.contact.length = 0
  sim.state.platforms.length = 0
  sim.state.arrays.length = 0
})

function place(defId: string, x: number, y: number, hp?: number): ContactInstance {
  const c = createContact(sim.state, contactById(defId)!, { x, y })
  c.velocity = { x: 0, y: 0 }
  if (hp !== undefined) c.hp = hp
  sim.state.contact.push(c)
  return c
}

describe('the tiered roster', () => {
  it('fills all three tiers', () => {
    for (const tier of TIERS) {
      expect(contactsOfTier(tier).length, `${tier} is empty`).toBeGreaterThan(0)
    }
  })

  it('has no duplicate ids or names', () => {
    const ids = CONTACT.map((c) => c.id)
    const names = CONTACT.map((c) => c.name)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(names).size).toBe(names.length)
  })

  it('gives each Contact its own pattern', () => {
    // PLAN.md asks for "each with a unique pattern". Two Contacts sharing one
    // read as the same enemy wearing different numbers.
    const used = CONTACT.map((c) => c.patternId)
    expect(new Set(used).size, 'a pattern is used twice').toBe(used.length)
  })

  it('points every Contact at a pattern that exists', () => {
    for (const c of CONTACT) {
      expect(patternById(c.patternId), `${c.id} -> ${c.patternId}`).toBeDefined()
    }
  })

  it('warns before every pattern, above the floor', () => {
    // combat-spec.md §5: a pattern that can kill without warning is a bug.
    for (const p of PATTERNS) {
      expect(p.telegraphMs, p.id).toBeGreaterThanOrEqual(MIN_TELEGRAPH_MS)
    }
  })

  it('spreads every armour class across more than one tier', () => {
    /*
     * If an armour class lived in exactly one tier, that whole tier could be
     * answered with a single damage type — and the type matrix would stop being
     * a decision anywhere the tier appeared alone.
     */
    for (const armour of ALL_ARMOUR_CLASSES) {
      const tiers = new Set(CONTACT.filter((c) => c.armour === armour).map((c) => c.tier))
      expect(tiers.size, `${armour} appears in only ${[...tiers].join(', ')}`).toBeGreaterThan(1)
    }
  })

  it('makes each tier tougher than the one below on average', () => {
    const meanHp = (tier: ContactTier) => {
      const of = contactsOfTier(tier)
      return of.reduce((n, c) => n + c.maxHp, 0) / of.length
    }
    expect(meanHp('elite')).toBeGreaterThan(meanHp('basic'))
    expect(meanHp('specialist')).toBeGreaterThan(meanHp('basic'))
  })
})

describe('the zone roster is checked against the waves', () => {
  it('declares every Contact its waves actually spawn', () => {
    /*
     * `enemyPool` sat on ZoneDef unread for twenty phases. It is now the
     * zone's declared roster, and this is what makes declaring it worth
     * anything: a wave referencing a Contact the zone never listed is either a
     * typo or content drifting away from its own design.
     */
    for (const zone of ZONES) {
      const pool = new Set(zone.enemyPool)
      for (const stage of zone.stages) {
        for (const wave of stage.waves) {
          if (isBossWave(wave)) continue
          for (const group of wave.groups) {
            expect(pool.has(group.defId), `${zone.id} spawns ${group.defId}`).toBe(true)
          }
        }
      }
    }
  })

  it('lists only Contacts that exist', () => {
    for (const zone of ZONES) {
      for (const id of zone.enemyPool) {
        expect(contactById(id), `${zone.id} lists ${id}`).toBeDefined()
      }
    }
  })

  it('reaches every authored Contact somewhere', () => {
    // A Contact no zone can spawn is content nobody will ever see — the same
    // dead-configuration problem as an unreachable code branch, and this
    // project keeps finding bugs in exactly that gap.
    const reachable = new Set(ZONES.flatMap((z) => z.enemyPool))
    for (const c of CONTACT) {
      expect(reachable.has(c.id), `${c.id} is in no zone`).toBe(true)
    }
  })
})

describe('the over-level bonus adds bodies, not set pieces', () => {
  it('scales a basic group and leaves elites and specialists alone', () => {
    /*
     * The mechanical consequence of `tier`, and the reason it is not a label.
     * Applied flat, a stage authored with two Shells would run five against a
     * strong formation — three extra shielded Contacts is a different puzzle,
     * not a harder one.
     */
    // A deliberately over-strong field, so the bonus is live.
    const bolt = platformById('bolt')!
    for (const ring of RINGS) {
      for (let slot = 0; slot < ring.slots; slot++) {
        placePlatform(sim.state, bolt, ring.index, slot)
      }
    }

    const wave = {
      groups: [
        { defId: 'skiff', count: 10, delay: 0, interval: 0.4 },
        { defId: 'shell', count: 2, delay: 4, interval: 1.2 },
        { defId: 'warden', count: 2, delay: 6, interval: 1.2 },
      ],
      gapAfter: 4,
    }

    expect(
      overLevelBonus(sim.state, wave),
      'this fixture needs a live bonus to mean anything',
    ).toBeGreaterThan(0)

    const byId = new Map(directWave(sim.state, wave).groups.map((g) => [g.defId, g.count]))

    // The basic group grew; the elite and specialist ones did not.
    expect(byId.get('skiff')!).toBeGreaterThan(10)
    expect(byId.get('shell')).toBe(2)
    expect(byId.get('warden')).toBe(2)
  })

  it('still applies the stage scaling curve to every tier', () => {
    // Only the over-level *surcharge* is tier-gated. A deep stage must still
    // send more of everything, or specialists would thin out as the run goes on.
    const wave = { groups: [{ defId: 'shell', count: 4, delay: 0, interval: 1 }], gapAfter: 4 }
    const shallow = directWave(sim.state, wave).groups[0].count

    const deep = new Simulation(
      loadStage('service-floor:noted-in-the-log' as StageAddress),
      createRng(1),
    )
    const deepCount = directWave(deep.state, wave).groups[0].count

    expect(deepCount).toBeGreaterThan(shallow)
  })
})

describe('a Warden shields what is near it', () => {
  const damageTo = (c: ContactInstance) => {
    const before = c.hp
    damageContact(c, 10)
    return before - c.hp
  }

  it('softens hits on a neighbour inside its radius', () => {
    place('warden', 100, 0)
    const near = place('skiff', 130, 0)

    updateWards(sim.state)

    expect(near.damageScale).toBeLessThan(1)
    expect(damageTo(near)).toBeLessThan(10)
  })

  it('leaves anything outside the radius alone', () => {
    place('warden', 100, 0)
    const far = place('skiff', 400, 0)

    updateWards(sim.state)

    expect(far.damageScale).toBe(1)
    expect(damageTo(far)).toBe(10)
  })

  it('never shields itself', () => {
    // A self-warding Contact is just one with more effective HP, and the
    // decision it exists to create — kill this one first — would disappear.
    const warden = place('warden', 100, 0)

    updateWards(sim.state)

    expect(warden.damageScale).toBe(1)
  })

  it('stops shielding once it is dead', () => {
    const warden = place('warden', 100, 0)
    const near = place('skiff', 120, 0)
    warden.hp = 0

    updateWards(sim.state)

    expect(near.damageScale).toBe(1)
  })

  it('stacks multiplicatively, so overlapping Wardens never reach immunity', () => {
    /*
     * Additive reduction hits 100% at three Wardens and makes a wave literally
     * unkillable. Multiplicative approaches zero without arriving, so stacking
     * is strong and never degenerate.
     */
    place('warden', 100, 0)
    place('warden', 110, 0)
    place('warden', 105, 10)
    const near = place('skiff', 105, 0)

    updateWards(sim.state)

    expect(near.damageScale).toBeGreaterThan(0)
    expect(damageTo(near)).toBeGreaterThan(0)
  })

  it('clears the scale when the Warden is gone', () => {
    // The multiplier is cached on the instance, so a stale one would keep
    // shielding a Contact long after the Warden that shielded it died.
    place('warden', 100, 0)
    const near = place('skiff', 120, 0)
    updateWards(sim.state)
    expect(near.damageScale).toBeLessThan(1)

    sim.state.contact = sim.state.contact.filter((c) => c.def.id !== 'warden')
    updateWards(sim.state)

    expect(near.damageScale).toBe(1)
  })

  it('is the highest-threat Contact in the roster', () => {
    // `highestThreat` targeting only means something different from `nearest`
    // if something in the roster is worth crossing the field for.
    const top = [...CONTACT].sort((a, b) => b.threatWeight - a.threatWeight)[0]
    expect(top.id).toBe('warden')
  })

  it('is the only Contact that wards', () => {
    // One user, deliberately. Two independent warders in a wave is a stalemate
    // rather than a priority call.
    const warders = CONTACT.filter((c) => c.traits?.wardsNearby)
    expect(warders.map((c) => c.id)).toEqual(['warden'])
  })
})

describe('the guarded wave shape', () => {
  it('sends the guard in with the bulk, not behind it', () => {
    /*
     * The difference between `guarded` and `escorted`, and it is the whole
     * reason the shape exists. A Warden authored with `escorted` arrived six
     * seconds after its Skiffs on its own bearing, by which time they had
     * scattered — its ward covered 1.5% of Contact-ticks on the stage, and the
     * mechanic was present and inert. Same delay and same arc took that to
     * 5.1%.
     */
    const wave = guarded('skiff', 12, 'warden', 2)
    const [bulk, guard] = wave.groups

    expect(guard.delay).toBe(bulk.delay)
    expect(guard.arc).toEqual(bulk.arc)
    expect(bulk.arc, 'both need a shared bearing, not a random one').toBeDefined()
  })

  it('stays distinct from escorted, which delays on purpose', () => {
    // `escorted` is still right for a priority target walking into a busy
    // line. Collapsing the two would lose that.
    const e = escorted('skiff', 12, 'lance', 2)
    expect(e.groups[1].delay).toBeGreaterThan(e.groups[0].delay)
  })
})

describe('warding is wired into the tick', () => {
  it('applies over real simulated time, not just when called directly', () => {
    // The trait is only real if the loop runs it. Declared-but-unwired is the
    // failure this project keeps rediscovering.
    place('warden', 100, 0)
    const near = place('skiff', 120, 0)

    sim.tick(TICK_SECONDS)

    expect(near.damageScale).toBeLessThan(1)
  })
})
