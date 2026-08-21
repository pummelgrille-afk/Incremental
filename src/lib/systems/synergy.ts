import { conjunctionScaleOf, type MovementInstance } from '../entities/Movement'
import type { ConjunctionScale } from '../entities/types'
import { CONJUNCTION, ringByIndex, slotAngle } from '../content/field'
import { pairingOf, type TypePairing } from '../content/damageTypes'
import { grantBonus } from './buffs'
import type { SimulationState } from '../core/simulation'
import { angleDelta } from './ai'
import { computeDamage, damageSlack, reapSlack } from './combat'

/**
 * Conjunction — the signature mechanic (combat-spec.md §3).
 *
 * Movements on *different* rings that fall within `tolerance` of each other
 * fire a scaled burst. Because ring periods are pairwise coprime (8 : 14 : 22 =
 * 4 : 7 : 11), alignments never repeat on a short cycle: the player arranges
 * for them in advance and then watches, which is P3 made mechanical.
 *
 * Runs on its own 100 ms cadence rather than every tick. At 20 Hz simulation
 * that is every other tick, and it keeps an O(n²) angular comparison off the
 * hot path.
 */

export interface ConjunctionEvent {
  participants: MovementInstance[]
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

function slotKey(participants: MovementInstance[]): string {
  return participants
    .map((m) => `${m.slot.ring}:${m.slot.slot}`)
    .sort()
    .join('|')
}

function currentAngle(sim: SimulationState, movement: MovementInstance): number | null {
  const ring = ringByIndex(movement.slot.ring)
  if (!ring) return null
  return slotAngle(ring, movement.slot.slot, sim.rings[ring.index - 1]?.phase ?? 0)
}

/**
 * Find every group of Movements currently in conjunction.
 *
 * Groups are built greedily: each ungrouped unit seeds a group and absorbs any
 * unit on a *different* ring within tolerance. Greedy is right here — an exact
 * clustering would be slower and would not change what the player sees, since
 * tolerance is small relative to slot spacing.
 */
export function findConjunctions(sim: SimulationState): ConjunctionEvent[] {
  const active = sim.movements.filter((m) => m.disabledFor <= 0)
  if (active.length < 2) return []

  const angles = new Map<number, number>()
  for (const movement of active) {
    const angle = currentAngle(sim, movement)
    if (angle !== null) angles.set(movement.id, angle)
  }

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

      if (Math.abs(angleDelta(seedAngle, otherAngle)) <= CONJUNCTION.tolerance) {
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
  slackKilled: number
  filingsDropped: number
}

/**
 * Evaluate conjunctions and apply their effects.
 *
 * Call at most every `CONJUNCTION.evalInterval` ms; the caller owns the
 * accumulator so the cadence stays visible in the tick order.
 */
export function updateSynergy(sim: SimulationState, cooldowns: CooldownMap): SynergyResult {
  const result: SynergyResult = { fired: [], slackKilled: 0, filingsDropped: 0 }

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

    // Scale and pairing are independent: how many units aligned, and how well
    // their types agree. Duration is *not* scaled by either — a Grand
    // conjunction hits harder, it does not also last longer, or the two would
    // compound into permanent uptime against a 6 s cooldown.
    const multiplier =
      CONJUNCTION.multipliers[event.scale] * CONJUNCTION.pairing[event.pairing]
    const arc =
      event.pairing === 'interference' ? CONJUNCTION.interferenceArc : CONJUNCTION.pulseArc

    for (const movement of event.participants) {
      const effect = movement.def.conjunctionEffect
      const magnitude = effect.magnitude * multiplier
      const duration = effect.duration ?? 0

      switch (effect.kind) {
        case 'damagePulse': {
          // Hits Slack near the alignment's angle, not the whole field.
          for (const slack of sim.slack) {
            if (dead.has(slack.id)) continue
            const slackAngle = Math.atan2(slack.position.y, slack.position.x)
            if (Math.abs(angleDelta(event.angle, slackAngle)) <= arc) {
              // Carries the participating unit's damage type, so a conjunction
              // is as type-sensitive as the unit that fired it. Raw damage here
              // would make an off-type build strictly better at conjunctions
              // than an on-type one.
              const damage = computeDamage(
                magnitude,
                1,
                movement.def.damageType,
                slack.def.armour,
                slack.def.defence,
              )
              if (damageSlack(slack, damage)) dead.add(slack.id)
            }
          }
          break
        }
        case 'shield':
          grantBonus(movement.buffs.shield, magnitude, duration)
          break
        case 'haste':
          grantBonus(movement.buffs.haste, magnitude, duration)
          break
      }
    }
  }

  if (dead.size > 0) {
    const reaped = reapSlack(sim, dead)
    result.slackKilled = reaped.slackKilled
    result.filingsDropped = reaped.filingsDropped
  }

  return result
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
  const active = sim.movements.filter((m) => m.disabledFor <= 0)
  if (active.length < 2) return null

  const basePhases = sim.rings.map((r) => r.phase)

  for (let t = stepSeconds; t <= horizonSeconds; t += stepSeconds) {
    for (let i = 0; i < sim.rings.length; i++) {
      const ring = ringByIndex((i + 1) as 1 | 2 | 3)
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
