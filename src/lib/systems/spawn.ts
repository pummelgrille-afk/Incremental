import type { ContactDef, ContactInstance } from '../entities/Contact'
import { isBossWave, type SpawnGroup } from '../entities/Wave'
import { contactById } from '../content/contacts'
import { SPAWN_RADIUS } from '../content/field'
import { allocateId, type SimulationState } from '../core/simulation'
import type { Rng } from '../core/rng'
import { scaleDamage, scaleHp } from './scaling'

const ARC_JITTER = 0.5

function spawnPosition(
  group: SpawnGroup,
  index: number,
  count: number,
  rng: Rng,
  arcOffset: number,
) {
  let angle: number
  if (group.arc) {
    const t = count > 1 ? index / (count - 1) : 0.5
    const spacing = group.arc.width / Math.max(1, count - 1)
    const jitter = (rng.next() - 0.5) * spacing * ARC_JITTER

    angle = group.arc.centre + arcOffset + (t - 0.5) * group.arc.width + jitter
  } else {
    angle = rng.next() * Math.PI * 2
  }

  return {
    x: Math.cos(angle) * SPAWN_RADIUS,
    y: Math.sin(angle) * SPAWN_RADIUS,
  }
}

export function createContact(
  sim: SimulationState,
  def: ContactDef,
  position: { x: number; y: number },
  rng?: Rng,
): ContactInstance {
  const scalingIndex = sim.stage.scalingIndex
  const zoneMultiplier = sim.zone.scalingMultiplier

  const maxHp = scaleHp(def.maxHp, scalingIndex, zoneMultiplier)

  return {
    id: allocateId(sim),
    def,
    position,
    velocity: { x: 0, y: 0 },
    hp: maxHp,
    maxHp,
    scaledAttack: scaleDamage(def.attack, scalingIndex, zoneMultiplier),

    patternCooldown: def.patternInterval * (rng ? 0.4 + rng.next() * 0.6 : 0.7),
    telegraphRemaining: 0,
    shieldHitsRemaining: def.traits?.shieldHits ?? 0,
    hitFlash: 0,

    damageScale: 1,
  }
}

export function currentWave(sim: SimulationState, waveIndex: number) {
  if (waveIndex === sim.waveIndex && sim.activeWave) return sim.activeWave
  return sim.stage.waves[waveIndex]
}

export function updateSpawning(sim: SimulationState, rng: Rng, previousElapsed: number): void {
  if (sim.phase !== 'wave-active') return

  const wave = currentWave(sim, sim.waveIndex)
  if (!wave || isBossWave(wave)) return

  for (const group of wave.groups) {
    const def = contactById(group.defId)
    if (!def) continue

    for (let i = 0; i < group.count; i++) {
      const due = group.delay + group.interval * i

      if (due > previousElapsed && due <= sim.waveElapsed) {
        sim.contact.push(
          createContact(
            sim,
            def,
            spawnPosition(group, i, group.count, rng, sim.waveArcOffset),
            rng,
          ),
        )
      }
    }
  }
}

export function waveTotal(sim: SimulationState, waveIndex: number): number {
  const wave = currentWave(sim, waveIndex)
  if (!wave || isBossWave(wave)) return 0
  return wave.groups.reduce((n, g) => n + g.count, 0)
}

export function waveSpawnDuration(sim: SimulationState, waveIndex: number): number {
  const wave = currentWave(sim, waveIndex)
  if (!wave || isBossWave(wave)) return 0
  return wave.groups.reduce(
    (max, g) => Math.max(max, g.delay + g.interval * Math.max(0, g.count - 1)),
    0,
  )
}

const DEFAULT_ORBIT_RADIUS = 210

export function updateWards(sim: SimulationState): void {
  let anyWarden = false
  for (const c of sim.contact) {
    c.damageScale = 1
    if (c.def.traits?.wardsNearby && c.hp > 0) anyWarden = true
  }
  if (!anyWarden) return

  for (const warden of sim.contact) {
    const ward = warden.def.traits?.wardsNearby
    if (!ward || warden.hp <= 0) continue

    const radiusSq = ward.radius * ward.radius
    for (const other of sim.contact) {
      if (other.id === warden.id) continue

      const dx = other.position.x - warden.position.x
      const dy = other.position.y - warden.position.y
      if (dx * dx + dy * dy > radiusSq) continue

      other.damageScale *= 1 - ward.reduction
    }
  }
}

export function updateContactMotion(sim: SimulationState, dt: number): void {
  for (const contact of sim.contact) {
    const { x, y } = contact.position
    const distance = Math.hypot(x, y) || 1

    const towardCentreX = -x / distance
    const towardCentreY = -y / distance

    let speed = contact.def.speed

    switch (contact.def.motion) {
      case 'charge':

        if (distance < 240) speed *= 1.9
        break
      case 'swarm': {
        const weave = Math.sin(sim.elapsed * 2.2 + contact.id) * 0.35
        contact.velocity.x = (towardCentreX - towardCentreY * weave) * speed
        contact.velocity.y = (towardCentreY + towardCentreX * weave) * speed
        contact.position.x += contact.velocity.x * dt
        contact.position.y += contact.velocity.y * dt
        if (contact.hitFlash > 0) contact.hitFlash = Math.max(0, contact.hitFlash - dt)
        continue
      }
      case 'orbit': {
        const target = contact.def.traits?.orbitRadius ?? DEFAULT_ORBIT_RADIUS

        if (distance > target + 4) break

        const direction = contact.id % 2 === 0 ? 1 : -1
        contact.velocity.x = -towardCentreY * speed * direction
        contact.velocity.y = towardCentreX * speed * direction
        contact.position.x += contact.velocity.x * dt
        contact.position.y += contact.velocity.y * dt

        const drifted = Math.hypot(contact.position.x, contact.position.y) || 1
        contact.position.x = (contact.position.x / drifted) * target
        contact.position.y = (contact.position.y / drifted) * target

        if (contact.hitFlash > 0) contact.hitFlash = Math.max(0, contact.hitFlash - dt)
        continue
      }
      case 'drift':
      default:
        break
    }

    contact.velocity.x = towardCentreX * speed
    contact.velocity.y = towardCentreY * speed
    contact.position.x += contact.velocity.x * dt
    contact.position.y += contact.velocity.y * dt

    if (contact.hitFlash > 0) contact.hitFlash = Math.max(0, contact.hitFlash - dt)
  }
}
