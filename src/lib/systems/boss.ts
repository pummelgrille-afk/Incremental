import { phaseAt, type BossDef, type BossRuntime } from '../entities/Boss'
import type { ContactDef, ContactInstance } from '../entities/Contact'
import type { SimulationState } from '../core/simulation'
import type { Rng } from '../core/rng'
import { bossHp, bossDamage } from './scaling'
import { createContact } from './spawn'
import { contactById } from '../content/contacts'
import { SPAWN_RADIUS } from '../content/field'
import { allocateId } from '../core/simulation'

/**
 * Boss encounters.
 *
 * A boss runs through the ordinary Contact pipeline — motion, hurtbox, armour,
 * the damage formula, telegraphs, pattern emission — by being spawned as a
 * `ContactInstance` from a def synthesized here. The only thing this module
 * adds is **phases**.
 *
 * That reuse is the whole design. A separate boss pipeline would be four
 * systems running in parallel with the ordinary ones, and the first to drift
 * would be the damage formula: bosses would quietly stop respecting armour
 * matchups, and the type matrix would mean nothing in the fights where build
 * choice matters most.
 */

/**
 * The Contact def a boss is fielded as, for a given phase.
 *
 * Rebuilt on each phase change rather than mutated, because `ContactInstance.def`
 * is a `readonly` reference to shared content everywhere else in the codebase
 * and relaxing that for one entity type would be a poor trade.
 *
 * HP and damage are **not** scaled here — `createContact` applies the stage
 * curve itself, and `spawnBoss` applies the boss multipliers on top afterwards.
 * Doing it here as well is the obvious double-scaling bug and is guarded by a
 * test that pins a boss's HP against `bossHp`.
 */
function defForPhase(boss: BossDef, phaseIndex: number): ContactDef {
  const phase = boss.phases[phaseIndex]
  return {
    id: boss.id,
    name: boss.name,
    description: boss.description,
    // A boss is not tiered: the over-level director never touches a boss wave
    // (systems/scaling.ts returns it untouched), so the field would be inert.
    // 'specialist' is the honest label for something that demands an answer.
    tier: 'specialist',
    armour: boss.armour,
    // Bosses drift. `charge` would slam them into the Sun and `orbit` would
    // park them outside most Platforms' reach for the whole fight.
    motion: 'drift',
    maxHp: boss.maxHp,
    attack: boss.attack,
    defence: boss.defence,
    speed: boss.speed,
    hurtboxRadius: boss.hurtboxRadius,
    patternId: phase.patternId,
    patternInterval: phase.patternInterval,
    baseDrop: boss.baseDrop,
    // Always the most threatening thing on the field, so `highestThreat`
    // targeting does the obvious thing during an encounter.
    threatWeight: 10,
  }
}

/** Put a boss on the field and return its runtime state. */
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

  // The boss multipliers, on top of the stage curve createContact applied.
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

/**
 * Advance the encounter: phase transitions, their telegraph, and summons.
 *
 * Returns nothing; everything is written onto the simulation. Called once per
 * tick from the loop, before pattern emission, so a boss that has just entered
 * a transition does not also fire on the same tick.
 */
export function updateBoss(sim: SimulationState, dt: number): void {
  const runtime = sim.boss
  if (!runtime) return

  const contact = sim.contact.find((c) => c.id === runtime.contactId)
  if (!contact || contact.hp <= 0) {
    // The encounter is over the moment the body is gone. Leaving the runtime in
    // place would keep summoning into an empty stage.
    sim.boss = null
    return
  }

  runtime.announced = null

  // A transition in progress: the boss holds fire until it completes. This is
  // the player's window, and it is the reason a phase change is a moment rather
  // than a step change nobody sees.
  if (runtime.transitionRemaining > 0) {
    runtime.transitionRemaining -= dt
    contact.telegraphRemaining = Math.max(contact.telegraphRemaining, runtime.transitionRemaining)
    if (runtime.transitionRemaining > 0) return

    const phase = runtime.def.phases[runtime.phaseIndex]
    runtime.announced = phase.name
    runtime.summonCooldown = phase.summons?.everySeconds ?? 0
    // Re-arm on the new interval rather than inheriting the old phase's
    // countdown, or a slow phase followed by a fast one fires instantly.
    contact.patternCooldown = phase.patternInterval
    return
  }

  const target = phaseAt(runtime.def, contact.hp / contact.maxHp)
  if (target !== runtime.phaseIndex) {
    /*
     * Only ever forward. A boss healed above a threshold — by a Warden it
     * summoned, which The Dark Watch does — must not walk back into an earlier
     * phase, or a fight could oscillate between two phases indefinitely and
     * never resolve.
     */
    if (target > runtime.phaseIndex) {
      runtime.phaseIndex = target
      runtime.transitionRemaining = runtime.def.phaseTelegraphMs / 1000
      // Hold fire from this tick, not from the next one. Setting the telegraph
      // only inside the countdown branch left a one-tick window in which the
      // boss had already changed phase and could still emit.
      contact.telegraphRemaining = Math.max(
        contact.telegraphRemaining,
        runtime.transitionRemaining,
      )
      // Swap the def so pattern emission reads the new phase's shape. Rebuilt
      // rather than mutated; `ContactInstance.def` stays a readonly reference
      // to a def object, it is simply a different object now.
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
    // Around the boss, not at the rim: a summon that had to cross the whole
    // field would arrive after the phase that called it had ended.
    const angle = (i / summons.count) * Math.PI * 2
    const spawned = createContact(sim, def, {
      x: contact.position.x + Math.cos(angle) * 40,
      y: contact.position.y + Math.sin(angle) * 40,
    })
    sim.contact.push(spawned)
  }
}

/**
 * Swap a Contact's def, preserving its identity and its damage taken.
 *
 * The one place `def` is replaced. Implemented by rebuilding the instance in
 * place rather than by relaxing `readonly def` across every Contact for the
 * benefit of five entities.
 */
function replaceDef(
  sim: SimulationState,
  contact: ContactInstance,
  def: ContactDef,
): void {
  const index = sim.contact.indexOf(contact)
  if (index < 0) return
  sim.contact[index] = { ...contact, def }
}

/** Whether an encounter is live. Drives the HUD's boss bar. */
export function bossContact(sim: SimulationState): ContactInstance | null {
  if (!sim.boss) return null
  return sim.contact.find((c) => c.id === sim.boss!.contactId) ?? null
}

export { allocateId }
