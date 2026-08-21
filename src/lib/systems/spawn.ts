import type { SlackDef, SlackInstance } from '../entities/Slack'
import { isBossWave, type SpawnGroup } from '../entities/Wave'
import { slackById } from '../content/enemies'
import { SPAWN_RADIUS } from '../content/field'
import { allocateId, type SimulationState } from '../core/simulation'
import type { Rng } from '../core/rng'

/**
 * Wave spawning and enemy motion.
 *
 * Reads schedules from wave data — never hardcodes a spawn (CLAUDE.md). Slack
 * appear at the rim and move down the tension gradient toward the Mainspring,
 * which is the fiction's explanation for why everything converges on the centre
 * (narrative.md, "The Unwinding").
 */

/** Enemy stat scaling. economy-spec.md §5. */
export function scaleHp(base: number, scalingIndex: number, zoneMultiplier: number): number {
  return base * 1.14 ** scalingIndex * zoneMultiplier
}

export function scaleDamage(base: number, scalingIndex: number, zoneMultiplier: number): number {
  return base * 1.09 ** scalingIndex * zoneMultiplier
}

function spawnPosition(group: SpawnGroup, index: number, count: number, rng: Rng) {
  let angle: number
  if (group.arc) {
    // Spread the group evenly across its arc so a concentrated wave reads as a
    // wall rather than a random smear, concentrating the threat on one arc.
    const t = count > 1 ? index / (count - 1) : 0.5
    angle = group.arc.centre + (t - 0.5) * group.arc.width
  } else {
    angle = rng.next() * Math.PI * 2
  }

  return {
    x: Math.cos(angle) * SPAWN_RADIUS,
    y: Math.sin(angle) * SPAWN_RADIUS,
  }
}

/**
 * Build a Slack instance.
 *
 * `rng` is **optional and opting in to jitter**, not the reverse. Omitting it
 * gives a fixed stagger, so a caller can never introduce nondeterminism by
 * forgetting to thread a generator through — which is exactly how a stray
 * `Math.random()` survived here until Phase 12.
 */
export function createSlack(
  sim: SimulationState,
  def: SlackDef,
  position: { x: number; y: number },
  rng?: Rng,
): SlackInstance {
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
    // Stagger the first emission so a group does not fire in perfect unison.
    // Deterministic midpoint when no generator is supplied.
    patternCooldown: def.patternInterval * (rng ? 0.4 + rng.next() * 0.6 : 0.7),
    telegraphRemaining: 0,
    shieldHitsRemaining: def.traits?.shieldHits ?? 0,
    hitFlash: 0,
  }
}

/**
 * Spawn anything the current wave's schedule says is due.
 *
 * Driven by `waveElapsed` rather than by a per-group timer, so the schedule is
 * declarative and a wave can be restarted by resetting one number.
 */
export function updateSpawning(sim: SimulationState, rng: Rng, previousElapsed: number): void {
  if (sim.phase !== 'wave-active') return

  const wave = sim.stage.waves[sim.waveIndex]
  if (!wave || isBossWave(wave)) return

  for (const group of wave.groups) {
    const def = slackById(group.defId)
    if (!def) continue

    for (let i = 0; i < group.count; i++) {
      const due = group.delay + group.interval * i
      // Fire exactly once, on the tick that crosses the due time.
      if (due > previousElapsed && due <= sim.waveElapsed) {
        sim.slack.push(
          createSlack(sim, def, spawnPosition(group, i, group.count, rng), rng),
        )
      }
    }
  }
}

/** Total Slack a wave will produce. Used to decide when it is cleared. */
export function waveTotal(sim: SimulationState, waveIndex: number): number {
  const wave = sim.stage.waves[waveIndex]
  if (!wave || isBossWave(wave)) return 0
  return wave.groups.reduce((n, g) => n + g.count, 0)
}

/** Seconds until a wave has finished spawning everything. */
export function waveSpawnDuration(sim: SimulationState, waveIndex: number): number {
  const wave = sim.stage.waves[waveIndex]
  if (!wave || isBossWave(wave)) return 0
  return wave.groups.reduce(
    (max, g) => Math.max(max, g.delay + g.interval * Math.max(0, g.count - 1)),
    0,
  )
}

/**
 * Move Slack toward the Mainspring according to their motion archetype.
 *
 * PLACEHOLDER SCOPE — Phase 15 adds the full set. `orbit` is stubbed to `drift`
 * here rather than faked badly.
 */
export function updateSlackMotion(sim: SimulationState, dt: number): void {
  for (const slack of sim.slack) {
    const { x, y } = slack.position
    const distance = Math.hypot(x, y) || 1

    // Unit vector pointing inward.
    const towardCentreX = -x / distance
    const towardCentreY = -y / distance

    let speed = slack.def.speed

    switch (slack.def.motion) {
      case 'charge':
        // Accelerates inside the outer ring — the Manual's stated concern.
        if (distance < 240) speed *= 1.9
        break
      case 'swarm': {
        // Slight tangential weave so a group does not collapse into one line.
        const weave = Math.sin(sim.elapsed * 2.2 + slack.id) * 0.35
        slack.velocity.x = (towardCentreX - towardCentreY * weave) * speed
        slack.velocity.y = (towardCentreY + towardCentreX * weave) * speed
        slack.position.x += slack.velocity.x * dt
        slack.position.y += slack.velocity.y * dt
        if (slack.hitFlash > 0) slack.hitFlash = Math.max(0, slack.hitFlash - dt)
        continue
      }
      case 'drift':
      case 'orbit':
      default:
        break
    }

    slack.velocity.x = towardCentreX * speed
    slack.velocity.y = towardCentreY * speed
    slack.position.x += slack.velocity.x * dt
    slack.position.y += slack.velocity.y * dt

    if (slack.hitFlash > 0) slack.hitFlash = Math.max(0, slack.hitFlash - dt)
  }
}
