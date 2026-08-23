import { conjunctionScaleOf, type PlatformInstance } from '../entities/Platform'
import type { ConjunctionScale } from '../entities/types'
import { CONJUNCTION, RINGS, ringByIndex, slotAngle } from '../content/field'
import { pairingOf, type TypePairing } from '../content/damageTypes'
import {
  CONJUNCTION_BURST,
  CONJUNCTION_RADIUS,
  TYPE_COLOURS,
} from '../content/effects'
import { RIM_RADIUS } from '../content/field'
import { grantBonus } from './buffs'
import { TELEMETRY_SOURCES } from './telemetry'
import type { SimulationState } from '../core/simulation'
import { angleDelta } from './ai'
import { computeDamage, damageContact, reapContact } from './combat'

export interface ConjunctionEvent {
  participants: PlatformInstance[]
  scale: ConjunctionScale

  angle: number

  pairing: TypePairing
}

type CooldownMap = Map<string, number>

export function createCooldowns(): CooldownMap {
  return new Map()
}

function slotKey(participants: PlatformInstance[]): string {
  return participants
    .map((m) => `${m.slot.ring}:${m.slot.slot}`)
    .sort()
    .join('|')
}

function currentAngle(sim: SimulationState, platform: PlatformInstance): number | null {
  const ring = ringByIndex(platform.slot.ring)
  if (!ring) return null
  return slotAngle(ring, platform.slot.slot, sim.rings[ring.index - 1]?.phase ?? 0)
}

export function findConjunctions(sim: SimulationState): ConjunctionEvent[] {
  const active = sim.platforms.filter((m) => m.disabledFor <= 0)
  if (active.length < 2) return []

  const angles = new Map<number, number>()
  for (const platform of active) {
    const angle = currentAngle(sim, platform)
    if (angle !== null) angles.set(platform.id, angle)
  }

  const tolerance = CONJUNCTION.tolerance + sim.effects.conjunctionTolerance

  const events: ConjunctionEvent[] = []
  const claimed = new Set<number>()

  for (const seed of active) {
    if (claimed.has(seed.id)) continue
    const seedAngle = angles.get(seed.id)
    if (seedAngle === undefined) continue

    const group = [seed]
    const rings = new Set([seed.slot.ring])

    for (const other of active) {
      if (other.id === seed.id || claimed.has(other.id)) continue

      if (rings.has(other.slot.ring)) continue

      const otherAngle = angles.get(other.id)
      if (otherAngle === undefined) continue

      if (Math.abs(angleDelta(seedAngle, otherAngle)) <= tolerance) {
        group.push(other)
        rings.add(other.slot.ring)
      }
    }

    if (group.length >= 2) {
      for (const m of group) claimed.add(m.id)
      events.push({
        participants: group,
        scale: conjunctionScaleOf(group.length),
        angle: seedAngle,
        pairing: pairingOf(group.map((m) => m.def.damageType)),
      })
    }
  }

  return events
}

export interface SynergyResult {
  fired: ConjunctionEvent[]
  contactKilled: number
  salvageDropped: number
}

export function updateSynergy(sim: SimulationState, cooldowns: CooldownMap): SynergyResult {
  const result: SynergyResult = { fired: [], contactKilled: 0, salvageDropped: 0 }

  const step = CONJUNCTION.evalInterval / 1000
  for (const [key, remaining] of cooldowns) {
    const next = remaining - step
    if (next <= 0) cooldowns.delete(key)
    else cooldowns.set(key, next)
  }

  const dead = new Set<number>()

  for (const event of findConjunctions(sim)) {
    const key = slotKey(event.participants)
    if (cooldowns.has(key)) continue

    cooldowns.set(key, CONJUNCTION.cooldown)
    result.fired.push(event)
    if (sim.telemetry) sim.telemetry.conjunctionsFired++

    const multiplier =
      CONJUNCTION.multipliers[event.scale] *
      CONJUNCTION.pairing[event.pairing] *
      (1 + sim.effects.conjunctionPotency)
    const arc =
      event.pairing === 'interference' ? CONJUNCTION.interferenceArc : CONJUNCTION.pulseArc

    for (const platform of event.participants) {
      const effect = platform.def.conjunctionEffect
      const magnitude = effect.magnitude * multiplier
      const duration = effect.duration ?? 0

      switch (effect.kind) {
        case 'damagePulse': {
          for (const contact of sim.contact) {
            if (dead.has(contact.id)) continue
            const contactAngle = Math.atan2(contact.position.y, contact.position.x)
            if (Math.abs(angleDelta(event.angle, contactAngle)) <= arc) {
              const damage = computeDamage(
                magnitude,
                1,
                platform.def.damageType,
                contact.def.armour,
                contact.def.defence,
              )
              const before = contact.hp
              const died = damageContact(contact, damage)
              sim.telemetry?.damage(TELEMETRY_SOURCES.conjunction, before - contact.hp, died)
              if (died) dead.add(contact.id)
            }
          }
          break
        }
        case 'shield':
          grantBonus(platform.buffs.shield, magnitude, duration)
          break
        case 'haste':
          grantBonus(platform.buffs.haste, magnitude, duration)
          break
        case 'repair':

          for (const ally of event.participants) {
            ally.hp = Math.min(ally.maxHp, ally.hp + magnitude)
          }
          break
      }
    }
  }

  if (dead.size > 0) {
    const reaped = reapContact(sim, dead)
    result.contactKilled = reaped.contactKilled
    result.salvageDropped = reaped.salvageDropped
  }

  emitConjunctionBurst(sim, result.fired)

  return result
}

function emitConjunctionBurst(sim: SimulationState, fired: ConjunctionEvent[]): void {
  if (fired.length === 0) return

  let largest = fired[0]
  for (const event of fired) {
    if (event.participants.length > largest.participants.length) largest = event
  }

  const burst = CONJUNCTION_BURST[largest.scale]
  const radius = RIM_RADIUS * CONJUNCTION_RADIUS

  sim.particles.burst({
    x: Math.cos(largest.angle) * radius,
    y: Math.sin(largest.angle) * radius,
    angle: largest.angle,
    count: burst.count,
    spread: burst.spread,
    speed: burst.speed,
    life: burst.life,
    size: burst.size,
    drag: burst.drag,
    colour: TYPE_COLOURS[largest.participants[0].def.damageType],
  })
}

export function timeToNextConjunction(
  sim: SimulationState,
  horizonSeconds = 120,
  stepSeconds = 0.1,
): number | null {
  const active = sim.platforms.filter((m) => m.disabledFor <= 0)
  if (active.length < 2) return null

  const basePhases = sim.rings.map((r) => r.phase)

  for (let t = stepSeconds; t <= horizonSeconds; t += stepSeconds) {
    for (let i = 0; i < sim.rings.length; i++) {
      const ring = RINGS[i]
      if (!ring) continue
      sim.rings[i].phase = basePhases[i] + (Math.PI * 2 / ring.period) * t
    }

    if (findConjunctions(sim).length > 0) {
      for (let i = 0; i < sim.rings.length; i++) sim.rings[i].phase = basePhases[i]
      return t
    }
  }

  for (let i = 0; i < sim.rings.length; i++) sim.rings[i].phase = basePhases[i]
  return null
}
