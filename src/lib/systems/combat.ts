import type { PlatformInstance } from '../entities/Platform'
import type { ContactInstance } from '../entities/Contact'
import { contactById } from '../content/contacts'
import { createContact } from './spawn'
import type { ArmourClass, DamageType } from '../entities/types'
import { typeMultiplier } from '../content/damageTypes'
import { SALVAGE } from '../content/economy'
import type { SimulationState } from '../core/simulation'
import { absorb, attackScaleOf, clearBuffs } from './buffs'
import { noUpgradeEffects } from '../entities/Upgrade'

const NO_EFFECTS = noUpgradeEffects()
import { platformPosition, type PlatformAttack } from './ai'
import type { Telemetry } from './telemetry'

const DEFENCE_CONSTANT = 100

const RECOVERY_TIME = 12

const SPLIT_OFFSET = 14
const SPLIT_ARC = Math.PI / 2

export function mitigate(raw: number, defence: number): number {
  return raw * (DEFENCE_CONSTANT / (DEFENCE_CONSTANT + Math.max(0, defence)))
}

export function computeDamage(
  attack: number,
  attackMultiplier: number,
  damageType: DamageType,
  armour: ArmourClass,
  defence: number,
): number {
  const raw = attack * attackMultiplier * typeMultiplier(damageType, armour)
  return mitigate(raw, defence)
}

export function damageContact(contact: ContactInstance, amount: number): boolean {
  if (contact.shieldHitsRemaining > 0) {
    contact.shieldHitsRemaining--
    contact.hitFlash = 0.12
    return false
  }

  const vulnerability = contact.def.traits?.vulnerableWhileTelegraphing
  const scaled =
    vulnerability && contact.telegraphRemaining > 0 ? amount * vulnerability : amount

  contact.hp -= scaled * contact.damageScale
  contact.hitFlash = 0.12
  return contact.hp <= 0
}

export function damagePlatform(
  platform: PlatformInstance,
  amount: number,
  telemetry?: Telemetry | null,
  effects = NO_EFFECTS,
): void {
  const effectiveDefence =
    platform.def.defence * (1 + platform.bonuses.defence) * (1 + effects.defence)

  let remaining = mitigate(amount, effectiveDefence)

  remaining -= absorb(platform.buffs.shield, remaining)

  platform.hp -= remaining
  platform.hitFlash = 0.12
  telemetry?.took(platform.def.id, amount)

  if (platform.hp <= 0) {
    platform.hp = 0
    platform.disabledFor = RECOVERY_TIME
    platform.targetId = null

    clearBuffs(platform.buffs)
    telemetry?.disabled(platform.def.id)
  }
}

export function damageSun(sim: SimulationState, amount: number): void {
  let remaining = amount

  if (sim.sun.shield > 0) {
    const absorbed = Math.min(sim.sun.shield, remaining)
    sim.sun.shield -= absorbed
    remaining -= absorbed
  }

  const applied = Math.min(remaining, sim.sun.hp)
  sim.sun.hp = Math.max(0, sim.sun.hp - remaining)
  sim.sun.hitFlash = 0.2
  sim.telemetry?.took('sun', applied)

  const fraction = sim.sun.maxHp > 0 ? sim.sun.hp / sim.sun.maxHp : 0
  if (fraction < sim.sun.lowestFraction) sim.sun.lowestFraction = fraction
}

export interface CombatResult {
  contactKilled: number
  salvageDropped: number
}

export function resolvePlatformAttacks(
  sim: SimulationState,
  attacks: PlatformAttack[],
): CombatResult {
  const dead = new Set<number>()

  for (const { platform, target } of attacks) {
    if (dead.has(target.id)) continue

    const damage = computeDamage(
      platform.def.attack,
      attackScaleOf(platform, sim.effects),
      platform.def.damageType,
      target.def.armour,
      target.def.defence,
    )

    const before = target.hp
    const died = damageContact(target, damage)
    sim.telemetry?.damage(platform.def.id, Math.min(before, damage), died)
    sim.feed.emit(
      died ? 'kill' : 'damage',
      target.position.x,
      target.position.y,
      before - target.hp,

      died ? (target.def.assetKey ?? '') : '',
    )

    const origin = platformPosition(sim, platform)
    sim.tracers.emit(
      origin.x,
      origin.y,
      target.position.x,
      target.position.y,
      platform.def.damageType,
      died,
    )

    if (died) dead.add(target.id)
  }

  return reapContact(sim, dead)
}

export function reapContact(sim: SimulationState, dead: Set<number>): CombatResult {
  if (dead.size === 0) return { contactKilled: 0, salvageDropped: 0 }

  let salvage = 0

  const zoneBonus = 1 + sim.zone.index * SALVAGE.zoneScaling

  const offspring: ContactInstance[] = []

  sim.contact = sim.contact.filter((contact) => {
    if (!dead.has(contact.id)) return true

    salvage += contact.def.baseDrop * zoneBonus

    const split = contact.def.traits?.splitsInto
    if (split) {
      const childDef = contactById(split.defId)
      if (childDef) {
        const heading = Math.atan2(contact.velocity.y, contact.velocity.x)
        for (let i = 0; i < split.count; i++) {
          const spread = ((i / Math.max(1, split.count - 1)) - 0.5) * SPLIT_ARC
          const angle = heading + (split.count > 1 ? spread : 0)
          offspring.push(
            createContact(sim, childDef, {
              x: contact.position.x + Math.cos(angle) * SPLIT_OFFSET,
              y: contact.position.y + Math.sin(angle) * SPLIT_OFFSET,
            }),
          )
        }
      }
    }

    return false
  })

  if (offspring.length > 0) sim.contact.push(...offspring)

  sim.salvageEarned += salvage
  return { contactKilled: dead.size, salvageDropped: salvage }
}
