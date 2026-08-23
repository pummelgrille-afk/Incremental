import { phaseAt, type BossDef, type BossRuntime } from '../entities/Boss'
import type { ContactDef, ContactInstance } from '../entities/Contact'
import type { SimulationState } from '../core/simulation'
import type { Rng } from '../core/rng'
import { bossHp, bossDamage } from './scaling'
import { createContact } from './spawn'
import { contactById } from '../content/contacts'
import { SPAWN_RADIUS } from '../content/field'
import { allocateId } from '../core/simulation'

function defForPhase(boss: BossDef, phaseIndex: number): ContactDef {
  const phase = boss.phases[phaseIndex]
  return {
    id: boss.id,
    name: boss.name,
    description: boss.description,

    tier: 'specialist',
    armour: boss.armour,

    motion: 'drift',
    maxHp: boss.maxHp,
    attack: boss.attack,
    defence: boss.defence,
    speed: boss.speed,
    hurtboxRadius: boss.hurtboxRadius,
    patternId: phase.patternId,
    patternInterval: phase.patternInterval,
    baseDrop: boss.baseDrop,

    threatWeight: 10,
  }
}

export function spawnBoss(
  sim: SimulationState,
  boss: BossDef,
  rng?: Rng,
): { contact: ContactInstance; runtime: BossRuntime } {
  const angle = rng ? rng.next() * Math.PI * 2 : 0
  const contact = createContact(sim, defForPhase(boss, 0), {
    x: Math.cos(angle) * SPAWN_RADIUS,
    y: Math.sin(angle) * SPAWN_RADIUS,
  })

  const scaled = bossHp(boss.maxHp, sim.stage.scalingIndex, sim.zone.scalingMultiplier)
  contact.maxHp = scaled
  contact.hp = scaled
  contact.scaledAttack = bossDamage(
    boss.attack,
    sim.stage.scalingIndex,
    sim.zone.scalingMultiplier,
  )

  sim.contact.push(contact)

  const runtime: BossRuntime = {
    def: boss,
    contactId: contact.id,
    phaseIndex: 0,
    transitionRemaining: 0,
    summonCooldown: boss.phases[0].summons?.everySeconds ?? 0,
    announced: boss.phases[0].name,
  }
  sim.boss = runtime
  return { contact, runtime }
}

export function updateBoss(sim: SimulationState, dt: number): void {
  const runtime = sim.boss
  if (!runtime) return

  const contact = sim.contact.find((c) => c.id === runtime.contactId)
  if (!contact || contact.hp <= 0) {
    sim.boss = null
    return
  }

  runtime.announced = null

  if (runtime.transitionRemaining > 0) {
    runtime.transitionRemaining -= dt
    contact.telegraphRemaining = Math.max(contact.telegraphRemaining, runtime.transitionRemaining)
    if (runtime.transitionRemaining > 0) return

    const phase = runtime.def.phases[runtime.phaseIndex]
    runtime.announced = phase.name
    runtime.summonCooldown = phase.summons?.everySeconds ?? 0

    contact.patternCooldown = phase.patternInterval
    return
  }

  const target = phaseAt(runtime.def, contact.hp / contact.maxHp)
  if (target !== runtime.phaseIndex) {
    if (target > runtime.phaseIndex) {
      runtime.phaseIndex = target
      runtime.transitionRemaining = runtime.def.phaseTelegraphMs / 1000

      contact.telegraphRemaining = Math.max(
        contact.telegraphRemaining,
        runtime.transitionRemaining,
      )

      replaceDef(sim, contact, defForPhase(runtime.def, target))
      return
    }
  }

  const phase = runtime.def.phases[runtime.phaseIndex]
  const summons = phase.summons
  if (!summons) return

  runtime.summonCooldown -= dt
  if (runtime.summonCooldown > 0) return
  runtime.summonCooldown = summons.everySeconds

  const def = contactById(summons.defId)
  if (!def) return

  for (let i = 0; i < summons.count; i++) {
    const angle = (i / summons.count) * Math.PI * 2
    const spawned = createContact(sim, def, {
      x: contact.position.x + Math.cos(angle) * 40,
      y: contact.position.y + Math.sin(angle) * 40,
    })
    sim.contact.push(spawned)
  }
}

function replaceDef(
  sim: SimulationState,
  contact: ContactInstance,
  def: ContactDef,
): void {
  const index = sim.contact.indexOf(contact)
  if (index < 0) return
  sim.contact[index] = { ...contact, def }
}

export function bossContact(sim: SimulationState): ContactInstance | null {
  if (!sim.boss) return null
  return sim.contact.find((c) => c.id === sim.boss!.contactId) ?? null
}

export { allocateId }
