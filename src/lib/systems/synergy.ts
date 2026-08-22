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

/**
 * Conjunction — the signature mechanic (combat-spec.md §3).
 *
 * Platforms on *different* rings that fall within `tolerance` of each other
 * fire a scaled burst. Because ring periods are pairwise coprime (8 : 14 : 22 =
 * 4 : 7 : 11), alignments never repeat on a short cycle: the player arranges
 * for them in advance and then watches, which is P3 made mechanical.
 *
 * Runs on its own 100 ms cadence rather than every tick. At 20 Hz simulation
 * that is every other tick, and it keeps an O(n²) angular comparison off the
 * hot path.
 */

export interface ConjunctionEvent {
  participants: PlatformInstance[]
  scale: ConjunctionScale
  /** Mean angle of the participants — where the render layer draws the burst. */
  angle: number
  /** How the participants' damage types relate. combat-spec.md §3 rule 5. */
  pairing: TypePairing
}

/** Cooldowns keyed on the participating slot set, so a lingering alignment
 *  does not machine-gun. */
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

/**
 * Find every group of Platforms currently in conjunction.
 *
 * Groups are built greedily: each ungrouped unit seeds a group and absorbs any
 * unit on a *different* ring within tolerance. Greedy is right here — an exact
 * clustering would be slower and would not change what the player sees, since
 * tolerance is small relative to slot spacing.
 */
export function findConjunctions(sim: SimulationState): ConjunctionEvent[] {
  const active = sim.platforms.filter((m) => m.disabledFor <= 0)
  if (active.length < 2) return []

  const angles = new Map<number, number>()
  for (const platform of active) {
    const angle = currentAngle(sim, platform)
    if (angle !== null) angles.set(platform.id, angle)
  }

  // Regulation widens the window a conjunction counts within — the branch buys
  // reach and readability, and this is the clearest case of it.
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
      // Same-ring units can never be in conjunction — they hold a fixed
      // angular offset and would otherwise fire forever.
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

/**
 * Evaluate conjunctions and apply their effects.
 *
 * Call at most every `CONJUNCTION.evalInterval` ms; the caller owns the
 * accumulator so the cadence stays visible in the tick order.
 */
export function updateSynergy(sim: SimulationState, cooldowns: CooldownMap): SynergyResult {
  const result: SynergyResult = { fired: [], contactKilled: 0, salvageDropped: 0 }

  // Age existing cooldowns by the evaluation interval.
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

    // Scale and pairing are independent: how many units aligned, and how well
    // their types agree. Duration is *not* scaled by either — a Grand
    // conjunction hits harder, it does not also last longer, or the two would
    // compound into permanent uptime against a 6 s cooldown.
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
          // Hits Contact near the alignment's angle, not the whole field.
          for (const contact of sim.contact) {
            if (dead.has(contact.id)) continue
            const contactAngle = Math.atan2(contact.position.y, contact.position.x)
            if (Math.abs(angleDelta(event.angle, contactAngle)) <= arc) {
              // Carries the participating unit's damage type, so a conjunction
              // is as type-sensitive as the unit that fired it. Raw damage here
              // would make an off-type build strictly better at conjunctions
              // than an on-type one.
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
          /*
           * The only effect that leaves the unit that brought it. A Tuner deals
           * no damage at all, so if its conjunction healed only itself it would
           * contribute nothing to anyone, and "support" would be a label on a
           * worse damage unit.
           *
           * Capped at maxHp rather than allowed to overheal: an uncapped pool
           * would compound with the 6 s conjunction cooldown into a line that
           * never meaningfully takes damage.
           */
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

/**
 * The burst, at last — one per evaluation, for the largest alignment in it.
 *
 * `ConjunctionEvent.angle` has been documented as "where the render layer draws
 * the burst" since Phase 18, and nothing ever drew it: the game's signature
 * system fired in total silence.
 *
 * **One per evaluation rather than one per conjunction**, and that is a
 * measurement rather than a preference. A full formation of 48 Platforms fires
 * roughly 36 conjunctions a *second* — combinatorially many slot sets come into
 * line, each with its own cooldown — and a burst apiece cost 881 particles per
 * second against a budget of 400. It emptied the field on the opening stage.
 *
 * At a 100 ms cadence the eye reads one event anyway, so the extra 35 bought
 * nothing but overflow. Taking the largest keeps the thing worth seeing: a
 * Grand conjunction is the pay-off the whole formation puzzle is arranged for,
 * and it must not be hidden behind a Minor that happened to fire beside it.
 *
 * Thrown outward from the participants' arc rather than from the Sun: the
 * alignment happens on the rings, and a bloom from the centre would credit the
 * objective for what the formation did.
 */
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

/**
 * Seconds until the next conjunction for the current formation.
 *
 * combat-spec.md §3 makes the preview a hard requirement: planning is only
 * meaningful if it is legible. Simulated forward rather than solved
 * analytically — the closed form for three coprime periods is unpleasant, and
 * this runs once per formation change, not per frame.
 */
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
