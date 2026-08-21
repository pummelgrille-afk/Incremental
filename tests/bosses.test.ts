import { beforeEach, describe, expect, it } from 'vitest'
import { Simulation, TICK_SECONDS } from '../src/lib/core/loop'
import { loadStage } from '../src/lib/core/stageLoader'
import { createRng } from '../src/lib/core/rng'
import { BOSSES, bossById } from '../src/lib/content/bosses'
import { CONTACT, contactById } from '../src/lib/content/contacts'
import { patternById, MIN_TELEGRAPH_MS } from '../src/lib/systems/patterns'
import { spawnBoss, updateBoss, bossContact } from '../src/lib/systems/boss'
import { bossHp, isBossStage } from '../src/lib/systems/scaling'
import { phaseAt } from '../src/lib/entities/Boss'
import { placePlatform } from '../src/lib/core/formation'
import { platformById } from '../src/lib/content/platforms'
import { RINGS } from '../src/lib/content/field'
import { SCALING } from '../src/lib/content/scaling'
import type { RingIndex } from '../src/lib/entities/types'
import type { StageAddress } from '../src/lib/entities/Zone'

const STAGE: StageAddress = 'service-floor:first-shift'

let sim: Simulation

beforeEach(() => {
  sim = new Simulation(loadStage(STAGE), createRng(1))
  sim.state.contact.length = 0
  sim.state.platforms.length = 0
  sim.state.arrays.length = 0
  sim.state.boss = null
})

describe('the authored bosses', () => {
  it('transcribes the names narrative.md authored, in order', () => {
    // The copy belongs to the design doc. If these drift, the doc has stopped
    // being the source of truth it claims to be.
    expect(BOSSES.map((b) => b.name)).toEqual([
      'The Backlog',
      'The Sympathetic',
      'Long Wear',
      'The Blank Page',
      'The Dark Watch',
    ])
  })

  it('lands inside the count PLAN.md asks for', () => {
    expect(BOSSES.length).toBeGreaterThanOrEqual(3)
    expect(BOSSES.length).toBeLessThanOrEqual(5)
  })

  it('has no duplicate ids', () => {
    const ids = BOSSES.map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every boss multiple phases', () => {
    // PLAN.md asks for multi-phase attack patterns. A one-phase boss is a
    // Contact with a large HP bar.
    for (const b of BOSSES) expect(b.phases.length, b.id).toBeGreaterThan(1)
  })

  it('opens every boss at full health and orders phases downward', () => {
    for (const b of BOSSES) {
      expect(b.phases[0].fromHpFraction, `${b.id} must open at 1`).toBe(1)
      for (let i = 1; i < b.phases.length; i++) {
        expect(
          b.phases[i].fromHpFraction,
          `${b.id} phase ${i} is not below phase ${i - 1}`,
        ).toBeLessThan(b.phases[i - 1].fromHpFraction)
      }
    }
  })

  it('points every phase at a pattern that exists', () => {
    for (const b of BOSSES) {
      for (const p of b.phases) {
        expect(patternById(p.patternId), `${b.id}/${p.name}`).toBeDefined()
      }
    }
  })

  it('summons only Contacts that exist, and never in an opening phase', () => {
    // A fight should read as a duel before it becomes a crowd.
    for (const b of BOSSES) {
      expect(b.phases[0].summons, `${b.id} summons immediately`).toBeUndefined()
      for (const p of b.phases) {
        if (!p.summons) continue
        expect(contactById(p.summons.defId), `${b.id}/${p.name}`).toBeDefined()
        expect(p.summons.count, `${b.id}/${p.name}`).toBeGreaterThan(0)
        expect(p.summons.everySeconds, `${b.id}/${p.name}`).toBeGreaterThan(0)
      }
    }
  })

  it('telegraphs every phase change above the pattern floor', () => {
    /*
     * A phase change is the one moment a boss's behaviour changes underneath a
     * player who has already read it, so combat-spec.md §5's rule applies to
     * the transition and not only to the pattern after it.
     */
    for (const b of BOSSES) {
      expect(b.phaseTelegraphMs, b.id).toBeGreaterThanOrEqual(MIN_TELEGRAPH_MS)
    }
  })

  it('gives each boss its own first-clear bounty', () => {
    const bounties = BOSSES.map((b) => b.firstClearSalvage)
    expect(new Set(bounties).size, 'bounties are meant to be unique').toBe(bounties.length)
    for (const b of BOSSES) expect(b.firstClearSalvage, b.id).toBeGreaterThan(0)
  })

  it('gets harder down the list', () => {
    // The five are authored as a ladder across zones 2 to 6.
    for (let i = 1; i < BOSSES.length; i++) {
      expect(BOSSES[i].maxHp, BOSSES[i].id).toBeGreaterThan(BOSSES[i - 1].maxHp)
      expect(BOSSES[i].firstClearSalvage, BOSSES[i].id).toBeGreaterThan(
        BOSSES[i - 1].firstClearSalvage,
      )
    }
  })
})

describe('the HP scale', () => {
  it('authors base HP on the pre-multiplier scale, like every other def', () => {
    /*
     * The mistake this catches, because it was made here first: `maxHp` is
     * documented as *before* the stage curve and `bossHpMultiplier`, and the
     * first draft used 260 to 700 as though they were final numbers. At stage 8
     * that put The Backlog at 8,900 HP against a measured player output of
     * ~107 HP/s — an 83-second fight the Sun could not survive, and every boss
     * lost 0/6.
     *
     * Anchored to the toughest ordinary Contact rather than to a bare constant,
     * so a roster rebalance carries this with it.
     */
    const toughest = Math.max(...CONTACT.map((c) => c.maxHp))
    for (const b of BOSSES) {
      expect(b.maxHp, `${b.id} is authored on the wrong scale`).toBeLessThan(toughest * 4)
      expect(b.maxHp, `${b.id} is smaller than a Contact`).toBeGreaterThan(toughest)
    }
  })

  it('gives the first boss a fight length the Sun can survive', () => {
    /*
     * The Backlog is the only boss whose depth is known — stage 8, from
     * `bossInterval`. Measured against a plausible stage-8 formation the player
     * removes roughly 107 HP per second, and the Sun lasts about 45 seconds
     * under boss fire, so the fight has to fit inside that with room to spare.
     *
     * The band is deliberately wide: this guards the order of magnitude, which
     * is what went wrong, not the tuning. Phase 35 owns the tuning.
     */
    const first = bossById('the-backlog')!
    const hp = bossHp(first.maxHp, SCALING.bossInterval, 1)
    const referenceDps = 107

    expect(hp / referenceDps, 'fight is too short to be a milestone').toBeGreaterThan(15)
    expect(hp / referenceDps, 'fight outlasts the Sun').toBeLessThan(45)
  })
})

describe('phaseAt', () => {
  const boss = bossById('the-backlog')!

  it('opens on the first phase', () => {
    expect(phaseAt(boss, 1)).toBe(0)
    expect(phaseAt(boss, 0.9)).toBe(0)
  })

  it('moves down as health falls', () => {
    expect(phaseAt(boss, 0.6)).toBe(1)
    expect(phaseAt(boss, 0.3)).toBe(1)
    expect(phaseAt(boss, 0.25)).toBe(2)
    expect(phaseAt(boss, 0)).toBe(2)
  })

  it('is inclusive at the threshold', () => {
    // Otherwise a boss sitting exactly on a boundary never transitions.
    const at = boss.phases[1].fromHpFraction
    expect(phaseAt(boss, at)).toBe(1)
  })
})

describe('spawning an encounter', () => {
  it('puts the boss on the field as an ordinary Contact', () => {
    // The whole design: a boss reuses motion, hurtboxes, armour and the damage
    // formula rather than running a parallel pipeline that drifts from them.
    const { contact } = spawnBoss(sim.state, bossById('the-backlog')!)

    expect(sim.state.contact).toContain(contact)
    expect(contact.def.armour).toBe('massed')
    expect(contact.def.hurtboxRadius).toBeGreaterThan(0)
  })

  it('applies the boss multipliers exactly once', () => {
    /*
     * `createContact` already applies the stage curve, and `spawnBoss` applies
     * the boss multipliers on top. Applying the curve again inside the def
     * would square it — the obvious bug in this shape of code, and invisible
     * except as a boss with implausible HP.
     */
    const def = bossById('the-backlog')!
    const { contact } = spawnBoss(sim.state, def)

    expect(contact.maxHp).toBeCloseTo(
      bossHp(def.maxHp, sim.state.stage.scalingIndex, sim.state.zone.scalingMultiplier),
      5,
    )
    expect(contact.maxHp).toBeGreaterThan(def.maxHp * SCALING.bossHpMultiplier * 0.9)
  })

  it('records the runtime and finds its body again', () => {
    const { contact } = spawnBoss(sim.state, bossById('the-backlog')!)
    expect(sim.state.boss).not.toBeNull()
    expect(bossContact(sim.state)).toBe(contact)
  })
})

describe('phase transitions', () => {
  function wounded(id: string, fraction: number) {
    const def = bossById(id)!
    const { contact, runtime } = spawnBoss(sim.state, def)
    contact.hp = contact.maxHp * fraction
    return { def, contact, runtime }
  }

  it('telegraphs before the new phase begins', () => {
    const { def, runtime } = wounded('the-backlog', 0.5)

    updateBoss(sim.state, TICK_SECONDS)

    expect(runtime.phaseIndex).toBe(1)
    expect(runtime.transitionRemaining).toBeGreaterThan(0)
    expect(runtime.transitionRemaining).toBeCloseTo(def.phaseTelegraphMs / 1000, 2)
  })

  it('holds fire for the whole transition', () => {
    // The player's window, and the reason a phase change is a moment rather
    // than a step change nobody sees.
    const { contact, runtime } = wounded('the-backlog', 0.5)
    updateBoss(sim.state, TICK_SECONDS)

    expect(contact.telegraphRemaining).toBeGreaterThan(0)
    expect(runtime.announced, 'announced only when the phase actually starts').toBeNull()
  })

  it('swaps the pattern when the transition completes', () => {
    const { def, runtime } = wounded('the-backlog', 0.5)
    updateBoss(sim.state, TICK_SECONDS)
    for (let i = 0; i < 40; i++) updateBoss(sim.state, TICK_SECONDS)

    expect(runtime.transitionRemaining).toBeLessThanOrEqual(0)
    expect(bossContact(sim.state)!.def.patternId).toBe(def.phases[1].patternId)
    expect(bossContact(sim.state)!.def.patternInterval).toBe(def.phases[1].patternInterval)
  })

  it('re-arms the cooldown on the new interval', () => {
    // Inheriting the old phase's countdown means a slow phase followed by a
    // fast one fires the instant the transition ends.
    const { def } = wounded('the-backlog', 0.5)
    for (let i = 0; i < 60; i++) updateBoss(sim.state, TICK_SECONDS)

    expect(bossContact(sim.state)!.patternCooldown).toBeCloseTo(
      def.phases[1].patternInterval,
      1,
    )
  })

  it('never walks backwards into an earlier phase', () => {
    /*
     * The Dark Watch summons a Warden, and a Warden could in principle push a
     * boss back above a threshold. Oscillating between two phases would mean a
     * fight that never resolves.
     */
    const { contact, runtime } = wounded('the-dark-watch', 0.2)
    for (let i = 0; i < 80; i++) updateBoss(sim.state, TICK_SECONDS)
    const deep = runtime.phaseIndex
    expect(deep).toBeGreaterThan(0)

    contact.hp = contact.maxHp
    for (let i = 0; i < 80; i++) updateBoss(sim.state, TICK_SECONDS)

    expect(runtime.phaseIndex).toBe(deep)
  })

  it('keeps the boss identity and damage across a phase swap', () => {
    // The def is replaced, not the entity. A new id would break projectile
    // attribution and every unit currently targeting it.
    const { contact, runtime } = wounded('the-backlog', 0.5)
    const id = contact.id
    const hp = contact.hp

    for (let i = 0; i < 60; i++) updateBoss(sim.state, TICK_SECONDS)

    const now = bossContact(sim.state)!
    expect(now.id).toBe(id)
    expect(now.hp).toBe(hp)
    expect(runtime.contactId).toBe(id)
  })
})

describe('summons', () => {
  it('arrive during a phase that calls for them', () => {
    const def = bossById('the-backlog')!
    const { contact } = spawnBoss(sim.state, def)
    contact.hp = contact.maxHp * 0.5

    for (let i = 0; i < 400; i++) updateBoss(sim.state, TICK_SECONDS)

    const summoned = sim.state.contact.filter((c) => c.def.id === 'skiff')
    expect(summoned.length).toBeGreaterThan(0)
  })

  it('appear near the boss rather than at the rim', () => {
    // A summon crossing the whole field would arrive after the phase that
    // called it had ended.
    const def = bossById('the-backlog')!
    const { contact } = spawnBoss(sim.state, def)
    contact.hp = contact.maxHp * 0.5
    for (let i = 0; i < 400; i++) updateBoss(sim.state, TICK_SECONDS)

    const summoned = sim.state.contact.find((c) => c.def.id === 'skiff')!
    const dx = summoned.position.x - contact.position.x
    const dy = summoned.position.y - contact.position.y
    expect(Math.hypot(dx, dy)).toBeLessThan(80)
  })

  it('do not arrive in the opening phase', () => {
    const def = bossById('the-backlog')!
    spawnBoss(sim.state, def)

    for (let i = 0; i < 400; i++) updateBoss(sim.state, TICK_SECONDS)

    expect(sim.state.contact.length, 'the boss alone').toBe(1)
  })
})

describe('the encounter ends', () => {
  it('clears the runtime when the boss dies, so it stops summoning', () => {
    const def = bossById('the-backlog')!
    const { contact } = spawnBoss(sim.state, def)
    contact.hp = 0

    updateBoss(sim.state, TICK_SECONDS)

    expect(sim.state.boss).toBeNull()
  })
})

describe('a boss stage, end to end', () => {
  /**
   * No authored stage reaches the boss interval yet — zone 1 stops at scaling
   * index 3 and bosses fall every 8 — so the encounter is exercised against a
   * stage fixture built through the real loader and run on the real loop.
   * Without this the whole system would be untested until Phase 33.
   */
  function bossStage() {
    // Built from a real loaded state so nothing about the fixture diverges
    // from what the game actually runs; only the stage's own waves differ.
    const state = loadStage(STAGE)
    return {
      ...state,
      stage: {
        id: 'milestone',
        name: 'Milestone',
        scalingIndex: SCALING.bossInterval,
        baseOutput: 100000,
        clearanceReward: 5,
        waves: [{ bossId: 'the-backlog', gapAfter: 4 }],
      },
    }
  }

  it('is a real boss stage by the interval rule', () => {
    expect(isBossStage(SCALING.bossInterval)).toBe(true)
  })

  it('spawns the encounter and does not respawn it once defeated', () => {
    const s = new Simulation(bossStage(), createRng(2))
    const bolt = platformById('bolt')!
    for (const ring of RINGS) {
      for (let slot = 0; slot < ring.slots; slot++) {
        placePlatform(s.state, bolt, ring.index as RingIndex, slot)
      }
    }

    let sawBoss = false
    for (let t = 0; t < 400 / TICK_SECONDS; t++) {
      s.tick(TICK_SECONDS)
      if (s.state.boss) sawBoss = true
      if (s.state.phase === 'cleared') break
    }

    expect(sawBoss, 'the boss was never placed').toBe(true)
    expect(s.state.phase, 'the stage never resolved').toBe('cleared')
    // The marker, not `sim.boss`, is what stops a defeated encounter coming
    // straight back — a defeated boss clears its own runtime.
    expect(s.state.bossSpawnedFor).toBe(0)
    expect(s.state.boss).toBeNull()
  })

  it('runs every phase of the fight', () => {
    const s = new Simulation(bossStage(), createRng(3))
    const bolt = platformById('bolt')!
    for (const ring of RINGS) {
      for (let slot = 0; slot < ring.slots; slot++) {
        placePlatform(s.state, bolt, ring.index as RingIndex, slot)
      }
    }

    const seen = new Set<number>()
    for (let t = 0; t < 400 / TICK_SECONDS; t++) {
      s.tick(TICK_SECONDS)
      if (s.state.boss) seen.add(s.state.boss.phaseIndex)
      if (s.state.phase === 'cleared') break
    }

    expect(seen.size, `only reached phases ${[...seen].join(', ')}`).toBe(
      bossById('the-backlog')!.phases.length,
    )
  })
})
