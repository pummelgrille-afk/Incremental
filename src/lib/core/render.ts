import { Application, Assets, Container, Graphics, Sprite, Text, Texture, TextStyle } from 'pixi.js'
import { FLARE, RINGS, RIM_RADIUS, ringByIndex, slotAngle } from '../content/field'
import type { ContactInstance } from '../entities/Contact'
import {
  PALETTES,
  paletteFor,
  type ColourblindPalette,
  type FieldPalette,
} from '../content/palettes'
import { arrayPosition } from '../systems/ai'
import { attackIntervalOf } from '../systems/buffs'
import { EVENT_LIFETIME } from '../systems/feed'
import { TRACER_LIFETIME } from '../systems/tracers'
import {
  ANIMATION_STATES,
  clipDuration,
  contactState,
  frameAt,
  frameIndex,
  platformState,
  PROJECTILE_SECONDS_PER_FRAME,
  type AnimationState,
} from './animation'
import { backdropGeometry, type BackdropLayerGeometry } from './backdrop'
import { SPRITE_MANIFEST, spriteFrames } from './assetLoader'
import { TICK_SECONDS, type Simulation } from './loop'

const PALETTE = {
  background: 0x0b0a08,
  ringTrack: 0x2a2417,
  sun: 0xc9a227,
  platform: 0xc9a227,
  platformDisabled: 0x4a4335,
  detent: 0x8fb3c9,
  pallet: 0xc98f4a,
  array: 0x5eead4,
  contact: 0x8a8474,
  contactFlash: 0xffffff,
  conjunction: 0xfff1a8,
} as const

let active: FieldPalette = PALETTES.none

export interface RenderSettings {
  colourblindPalette: ColourblindPalette
  screenShake: boolean
  reducedMotion: boolean
}

let screenShakeEnabled = true
let reducedMotion = false

export interface Renderer {
  render(simulation: Simulation, dt?: number): void
  resize(): void

  applySettings(settings: RenderSettings): void
  destroy(): void

  toWorld(clientX: number, clientY: number): { x: number; y: number }
  readonly canvas: HTMLCanvasElement
}

const SUN_SPRITE = 'sun'

const PROJECTILE_SPRITES: Record<'contact' | 'array', string> = {
  contact: 'projectile-1',
  array: 'projectile-2',
}

const COMET_HEADING = (135 * Math.PI) / 180

async function loadTextures(): Promise<Map<string, Texture>> {
  const textures = new Map<string, Texture>()

  await Promise.all(
    Object.entries(SPRITE_MANIFEST).map(async ([key, url]) => {
      try {
        const texture = (await Assets.load(url)) as Texture
        texture.source.scaleMode = 'nearest'
        textures.set(key, texture)
      } catch {
      }
    }),
  )

  return textures
}

function spriteAt(texture: Texture, size: number): Sprite {
  const sprite = new Sprite(texture)
  sprite.anchor.set(0.5)

  const scale = size / Math.max(texture.width, texture.height)
  sprite.scale.set(scale)
  return sprite
}

interface AnimatedBody {
  key: string
  sprite: Sprite
  clips: Record<AnimationState, Texture[]>
  state: AnimationState

  since: number

  frame: number
}

interface ProjectileView {
  node: Sprite | null
  fallback: Graphics | null

  frame: number
}

interface ContactView {
  node: Container
  body: AnimatedBody | null
  overlay: Graphics
}

function animatedBody(
  textures: Map<string, Texture>,
  key: string | undefined,
  size: number,
): AnimatedBody | null {
  if (!key) return null

  const clips = {} as Record<AnimationState, Texture[]>
  for (const state of ANIMATION_STATES) {
    clips[state] = spriteFrames(key, state)
      .map((frame) => textures.get(frame))
      .filter((texture): texture is Texture => texture !== undefined)
  }

  if (clips.idle.length === 0) return null

  return {
    key,
    sprite: spriteAt(clips.idle[0], size),
    clips,
    state: 'idle',
    since: 0,
    frame: -1,
  }
}

function advanceBody(body: AnimatedBody, state: AnimationState, elapsed: number): void {
  if (state !== body.state) {
    body.state = state
    body.since = elapsed
    body.frame = -1
  }

  const frames = body.clips[state]
  if (frames.length === 0) return

  const index = frameIndex(state, elapsed - body.since, frames.length)
  if (index === body.frame) return

  body.frame = index
  body.sprite.texture = frames[index]
}

export async function createRenderer(host: HTMLElement): Promise<Renderer> {
  const app = new Application()
  await app.init({
    background: PALETTE.background,
    antialias: true,
    resizeTo: host,

    resolution: Math.min(window.devicePixelRatio, 2),
    autoDensity: true,
  })
  host.appendChild(app.canvas)

  const world = new Container()
  app.stage.addChild(world)

  const backdropLayer = new Container()
  world.addChild(backdropLayer)

  const trackLayer = new Container()
  world.addChild(trackLayer)
  for (const ring of RINGS) {
    trackLayer.addChild(
      new Graphics().circle(0, 0, ring.radius).stroke({
        width: 1,
        color: PALETTE.ringTrack,
        alpha: 0.9,
      }),
    )
  }
  trackLayer.addChild(
    new Graphics().circle(0, 0, RIM_RADIUS).stroke({
      width: 1,
      color: PALETTE.ringTrack,
      alpha: 0.5,
    }),
  )

  const ringContainers = RINGS.map(() => {
    const container = new Container()
    world.addChild(container)
    return container
  })

  const textures = await loadTextures()

  interface BackdropView {
    graphic: Graphics
    degreesPerSecond: number
  }

  let backdropViews: BackdropView[] = []
  let backdropZone = ''

  function drawBackdrop(simulation: Simulation) {
    const zoneId = simulation.state.zone.id

    if (zoneId !== backdropZone) {
      backdropZone = zoneId
      for (const view of backdropViews) view.graphic.destroy()
      backdropViews = backdropGeometry(zoneId).map((layer: BackdropLayerGeometry) => {
        const graphic = new Graphics()
        for (const star of layer.stars) {
          graphic
            .circle(star.x, star.y, star.radius)
            .fill({ color: layer.tint, alpha: star.alpha })
        }
        backdropLayer.addChild(graphic)
        return { graphic, degreesPerSecond: layer.degreesPerSecond }
      })
    }

    const elapsed = simulation.state.elapsed
    for (const view of backdropViews) {
      view.graphic.rotation = (view.degreesPerSecond * elapsed * Math.PI) / 180
    }
  }

  const contactLayer = new Container()
  const projectileLayer = new Container()
  const effectLayer = new Container()
  const arrayLayer = new Container()
  world.addChild(contactLayer, arrayLayer, projectileLayer, effectLayer)

  const sunSprite = textures.has(SUN_SPRITE)
    ? spriteAt(textures.get(SUN_SPRITE)!, 58)
    : null
  if (sunSprite) world.addChild(sunSprite)

  const sun = new Graphics()
  world.addChild(sun)

  const strikeGraphic = new Graphics()
  effectLayer.addChild(strikeGraphic)

  const tracerGraphic = new Graphics()
  projectileLayer.addChild(tracerGraphic)

  const particleGraphic = new Graphics()
  effectLayer.addChild(particleGraphic)

  const feedLayer = new Container()
  world.addChild(feedLayer)
  const popupStyle = new TextStyle({
    fontFamily: 'system-ui, sans-serif',
    fontSize: 13,
    fontWeight: '600',
    fill: active.projectileContact,
  })
  const popups: Text[] = []

  const platformSprites = new Map<number, ContactView>()

  const contactSprites = new Map<number, ContactView>()

  const contactSigs = new Map<number, number>()
  const arraySprites = new Map<number, Graphics>()

  const projectileSprites: ProjectileView[] = []

  const recentre = () => {
    world.x = app.screen.width / 2 + shakeX
    world.y = app.screen.height / 2 + shakeY

    const fit = Math.min(app.screen.width, app.screen.height) / (RIM_RADIUS * 2.2)
    world.scale.set(Math.min(1, fit))
  }

  const SHAKE_MAX = 6
  const SHAKE_DECAY = 5
  let shakeEnergy = 0
  let shakeX = 0
  let shakeY = 0
  let previousOutput: number | null = null

  function updateShake(simulation: Simulation, dt: number) {
    const hp = simulation.state.sun.hp

    if (previousOutput !== null && hp < previousOutput && simulation.state.sun.maxHp > 0) {
      const fraction = (previousOutput - hp) / simulation.state.sun.maxHp
      shakeEnergy = Math.min(1, shakeEnergy + fraction * 8)
    }
    previousOutput = hp

    if (shakeEnergy <= 0) {
      if (shakeX !== 0 || shakeY !== 0) {
        shakeX = 0
        shakeY = 0
        recentre()
      }
      return
    }

    shakeEnergy = Math.max(0, shakeEnergy - SHAKE_DECAY * dt)

    const amplitude = SHAKE_MAX * shakeEnergy * shakeEnergy
    shakeX = (Math.random() * 2 - 1) * amplitude
    shakeY = (Math.random() * 2 - 1) * amplitude
    recentre()
  }

  recentre()
  app.renderer.on('resize', recentre)

  function drawPlatforms(simulation: Simulation, alpha: number) {
    const sim = simulation.state
    const seen = new Set<number>()

    for (const platform of sim.platforms) {
      seen.add(platform.id)
      const ring = ringByIndex(platform.slot.ring)
      if (!ring) continue

      let view = platformSprites.get(platform.id)
      if (!view) {
        const node = new Container()

        const body = animatedBody(textures, platform.def.assetKey, 22)
        const overlay = new Graphics()

        if (body) node.addChild(body.sprite)
        node.addChild(overlay)

        view = { node, body, overlay }
        platformSprites.set(platform.id, view)
        ringContainers[ring.index - 1].addChild(node)
      }

      const localAngle = slotAngle(ring, platform.slot.slot, 0)
      view.node.x = Math.cos(localAngle) * ring.radius
      view.node.y = Math.sin(localAngle) * ring.radius

      const sprite = view.overlay

      const disabled = platform.disabledFor > 0

      const colour = disabled
        ? PALETTE.platformDisabled
        : active.damage[platform.def.damageType]

      sprite.clear()

      if (view.body) {
        advanceBody(
          view.body,
          platformState({
            disabledFor: platform.disabledFor,
            hitFlash: platform.hitFlash,
            cooldownRemaining: platform.cooldownRemaining,
            attackInterval: attackIntervalOf(platform, sim.effects),
            attackFrames: view.body.clips.attack.length,
          }),
          sim.elapsed,
        )

        view.body.sprite.tint = disabled ? PALETTE.platformDisabled : 0xffffff
        view.body.sprite.alpha = disabled ? 0.4 : 1
      } else {
        sprite.circle(0, 0, 8).fill({ color: colour, alpha: disabled ? 0.4 : 1 })
      }

      if (!disabled) {
        const health = platform.hp / platform.maxHp
        if (health < 1) {
          sprite
            .arc(0, 0, 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * health)
            .stroke({ width: 2, color: colour, alpha: 0.8 })
        }
        if (platform.buffs.shield.magnitude > 0) {
          sprite.circle(0, 0, 13).stroke({ width: 1.5, color: PALETTE.array, alpha: 0.7 })
        }
      }
    }

    for (const [id, view] of platformSprites) {
      if (seen.has(id)) continue
      view.node.destroy({ children: true })
      platformSprites.delete(id)
    }

    for (let i = 0; i < ringContainers.length; i++) {
      const state = sim.rings[i]
      if (!state) continue
      ringContainers[i].rotation = state.phase + state.angularVelocity * alpha * TICK_SECONDS
    }
  }

  function drawArrays(simulation: Simulation) {
    const seen = new Set<number>()

    for (const array of simulation.state.arrays) {
      seen.add(array.id)
      let sprite = arraySprites.get(array.id)
      if (!sprite) {
        sprite = new Graphics()
        arraySprites.set(array.id, sprite)
        arrayLayer.addChild(sprite)
      }

      const position = arrayPosition(array)
      sprite.x = position.x
      sprite.y = position.y

      sprite.clear()
      sprite.rect(-7, -7, 14, 14).fill({
        color: PALETTE.array,
        alpha: array.disabledFor > 0 ? 0.3 : 1,
      })

      const whole = Math.floor(array.charge)
      for (let i = 0; i < array.maxCharge; i++) {
        sprite
          .circle(-6 + i * 6, 13, 2)
          .fill({ color: PALETTE.array, alpha: i < whole ? 1 : 0.22 })
      }
    }

    for (const [id, sprite] of arraySprites) {
      if (seen.has(id)) continue
      sprite.destroy()
      arraySprites.delete(id)
    }
  }

  function contactSignature(contact: ContactInstance): number {
    const flashing = contact.hitFlash > 0 ? 1 : 0

    const health = Math.round((contact.hp / contact.maxHp) * 20)
    const shielded = contact.shieldHitsRemaining > 0 ? 1 : 0
    return flashing | (shielded << 1) | (health << 2)
  }

  function drawContact(simulation: Simulation, alpha: number) {
    const seen = new Set<number>()
    const lead = alpha * TICK_SECONDS

    for (const contact of simulation.state.contact) {
      seen.add(contact.id)
      const size = contact.def.motion === 'drift' ? 11 : 7

      let view = contactSprites.get(contact.id)
      if (!view) {
        const node = new Container()

        const body = animatedBody(textures, contact.def.assetKey, size * 2.6)
        const overlay = new Graphics()

        if (body) node.addChild(body.sprite)
        node.addChild(overlay)

        view = { node, body, overlay }
        contactSprites.set(contact.id, view)
        contactLayer.addChild(node)
        contactSigs.set(contact.id, -1)
      }

      view.node.x = contact.position.x + contact.velocity.x * lead
      view.node.y = contact.position.y + contact.velocity.y * lead

      if (view.body) {
        advanceBody(
          view.body,
          contactState({
            hitFlash: contact.hitFlash,
            telegraphRemaining: contact.telegraphRemaining,
          }),
          simulation.state.elapsed,
        )

        view.body.sprite.tint = contact.hitFlash > 0 ? PALETTE.contactFlash : 0xffffff
      }

      const telegraphing = contact.telegraphRemaining > 0
      const signature = contactSignature(contact)

      if (!telegraphing && contactSigs.get(contact.id) === signature) continue
      contactSigs.set(contact.id, telegraphing ? -1 : signature)

      const sprite = view.overlay
      sprite.clear()
      if (!view.body) {
        sprite
          .circle(0, 0, size)
          .fill({ color: contact.hitFlash > 0 ? PALETTE.contactFlash : PALETTE.contact })
      }

      if (telegraphing) {
        const t = contact.telegraphRemaining
        sprite.circle(0, 0, size + 6 + t * 14).stroke({
          width: 2,
          color: active.telegraph,
          alpha: 0.35 + 0.4 * Math.abs(Math.sin(t * 18)),
        })
      }

      const health = contact.hp / contact.maxHp
      if (health < 1) {
        sprite
          .arc(0, 0, size + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * health)
          .stroke({ width: 1.5, color: PALETTE.contact, alpha: 0.8 })
      }
    }

    for (const [id, view] of contactSprites) {
      if (seen.has(id)) continue

      view.node.destroy({ children: true })
      contactSprites.delete(id)
      contactSigs.delete(id)
    }
  }

  const projectileFrames: Record<'contact' | 'array', Texture[]> = {
    contact: spriteFrames(PROJECTILE_SPRITES.contact, 'idle')
      .map((key) => textures.get(key))
      .filter((texture): texture is Texture => texture !== undefined),
    array: spriteFrames(PROJECTILE_SPRITES.array, 'idle')
      .map((key) => textures.get(key))
      .filter((texture): texture is Texture => texture !== undefined),
  }

  function drawProjectiles(simulation: Simulation, alpha: number) {
    const items = simulation.projectiles.items
    const lead = alpha * TICK_SECONDS

    while (projectileSprites.length < items.length) {
      const view: ProjectileView = { node: null, fallback: null, frame: -1 }
      projectileSprites.push(view)
    }

    for (let i = 0; i < items.length; i++) {
      const p = items[i]
      const view = projectileSprites[i]
      const texture = textures.get(PROJECTILE_SPRITES[p.faction])

      if (!p.active) {
        if (view.node?.visible) view.node.visible = false
        if (view.fallback?.visible) view.fallback.visible = false
        continue
      }

      if (texture) {
        const frames = projectileFrames[p.faction]

        if (!view.node) {
          view.node = new Sprite(texture)
          view.node.anchor.set(0.5)
          view.node.visible = false
          projectileLayer.addChild(view.node)
        }

        const sprite = view.node
        if (!sprite.visible) {
          sprite.visible = true
          sprite.texture = texture
          view.frame = -1

          const size = p.radius * 4
          sprite.scale.set(size / Math.max(texture.width, texture.height))
        }

        sprite.x = p.position.x + p.velocity.x * lead
        sprite.y = p.position.y + p.velocity.y * lead

        sprite.rotation = Math.atan2(p.velocity.y, p.velocity.x) - COMET_HEADING

        sprite.tint =
          p.faction === 'contact' ? active.projectileContact : active.projectileArray

        if (frames.length > 1) {
          const index = frameAt(
            p.lifetime + i * 0.031,
            frames.length,
            PROJECTILE_SECONDS_PER_FRAME,
            true,
          )
          if (index !== view.frame) {
            view.frame = index
            sprite.texture = frames[index]
          }
        }

        continue
      }

      if (!view.fallback) {
        view.fallback = new Graphics()
        view.fallback.visible = false
        projectileLayer.addChild(view.fallback)
      }

      const sprite = view.fallback
      if (!sprite.visible) {
        sprite.visible = true
        sprite.clear()
        sprite.circle(0, 0, p.radius).fill({
          color: p.faction === 'contact' ? active.projectileContact : active.projectileArray,
        })
      }

      sprite.x = p.position.x + p.velocity.x * lead
      sprite.y = p.position.y + p.velocity.y * lead
    }
  }

  function drawSun(simulation: Simulation) {
    const state = simulation.state.sun
    const fraction = state.maxHp > 0 ? state.hp / state.maxHp : 0
    const low = fraction < 0.3

    sun.clear()

    if (sunSprite) {
      sunSprite.tint = state.hitFlash > 0 ? 0xffffff : low ? active.sunLow : 0xffffff
      sunSprite.alpha = state.hitFlash > 0 ? 1 : 0.95
    } else {
      sun.circle(0, 0, 26).fill({
        color: state.hitFlash > 0 ? 0xffffff : low ? active.sunLow : PALETTE.sun,
        alpha: 0.95,
      })
    }

    sun
      .arc(0, 0, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fraction)
      .stroke({ width: 4, color: low ? active.sunLow : PALETTE.sun })

    if (state.shield > 0) {
      sun.circle(0, 0, 40).stroke({ width: 2, color: PALETTE.array, alpha: 0.6 })
    }
  }

  function drawStrike(simulation: Simulation) {
    const strike = simulation.lastStrike
    strikeGraphic.clear()
    if (!strike) return

    const t = Math.min(1, strike.age / 0.35)
    strikeGraphic
      .circle(strike.x, strike.y, FLARE.radius * (0.55 + 0.45 * t))
      .stroke({ width: 3 * (1 - t) + 1, color: PALETTE.conjunction, alpha: 1 - t })
  }

  function drawTracers(simulation: Simulation) {
    const tracers = simulation.state.tracers.items
    tracerGraphic.clear()

    for (let i = 0; i < tracers.length; i++) {
      const tracer = tracers[i]
      if (!tracer.active) continue

      const t = Math.min(1, tracer.age / TRACER_LIFETIME)
      const colour = active.damage[tracer.damageType]

      const head = t
      const tail = Math.max(0, t - 0.34)

      const dx = tracer.toX - tracer.fromX
      const dy = tracer.toY - tracer.fromY

      tracerGraphic
        .moveTo(tracer.fromX + dx * tail, tracer.fromY + dy * tail)
        .lineTo(tracer.fromX + dx * head, tracer.fromY + dy * head)
        .stroke({ width: 2, color: colour, alpha: 0.85 * (1 - t * t) })

      if (t < 0.5) {
        tracerGraphic
          .circle(tracer.fromX, tracer.fromY, 3 * (1 - t * 2))
          .fill({ color: colour, alpha: 0.7 })
      }

      if (tracer.lethal && t > 0.35) {
        tracerGraphic
          .circle(tracer.toX, tracer.toY, 4 + 6 * t)
          .stroke({ width: 1.5, color: colour, alpha: 0.8 * (1 - t) })
      }
    }
  }

  const deathSprites: (AnimatedBody | null)[] = []

  function drawDeaths(simulation: Simulation) {
    const events = simulation.state.feed.items

    for (let i = 0; i < events.length; i++) {
      const event = events[i]
      const existing = deathSprites[i] ?? null

      if (!event.active || event.kind !== 'kill' || event.spriteKey === '') {
        if (existing) existing.sprite.visible = false
        continue
      }

      let body = existing
      if (!body || body.key !== event.spriteKey) {
        existing?.sprite.destroy()
        body = animatedBody(textures, event.spriteKey, 22)
        deathSprites[i] = body
        if (body) effectLayer.addChild(body.sprite)
      }
      if (!body) continue

      body.sprite.visible = true
      body.sprite.x = event.x
      body.sprite.y = event.y

      body.state = 'death'
      const frames = body.clips.death
      const index = frameIndex('death', event.age, frames.length)
      if (index !== body.frame) {
        body.frame = index
        body.sprite.texture = frames[index]
      }

      const life = Math.max(clipDuration('death', frames.length), EVENT_LIFETIME)
      body.sprite.alpha = Math.max(0, 1 - event.age / life)
    }
  }

  function drawParticles(simulation: Simulation) {
    const particles = simulation.state.particles.items
    particleGraphic.clear()

    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i]
      if (!particle.active) continue

      const remaining = particle.life / particle.maxLife

      particleGraphic
        .circle(particle.x, particle.y, particle.size * remaining * remaining)
        .fill({ color: particle.colour, alpha: Math.min(1, remaining * 1.4) })
    }
  }

  const FEED_COLOURS: Record<string, number> = {
    damage: 0xe8e2d4,
    kill: PALETTE.sun,
    block: PALETTE.detent,
  }

  function drawFeed(simulation: Simulation) {
    const events = simulation.state.feed.items

    while (popups.length < events.length) {
      const text = new Text({ text: '', style: popupStyle })
      text.anchor.set(0.5)
      text.visible = false
      feedLayer.addChild(text)
      popups.push(text)
    }

    for (let i = 0; i < events.length; i++) {
      const event = events[i]
      const popup = popups[i]

      if (!event.active) {
        if (popup.visible) popup.visible = false
        continue
      }

      const t = event.age / EVENT_LIFETIME

      popup.visible = true
      popup.text = event.kind === 'block' ? '–' : String(event.amount)
      popup.style.fill = FEED_COLOURS[event.kind] ?? active.projectileContact

      popup.x = event.x
      popup.y = event.y - t * 22
      popup.alpha = 1 - t * t
      popup.scale.set(event.kind === 'kill' ? 1.15 : 1)
    }
  }

  let destroyed = false

  return {
    canvas: app.canvas,

    render(simulation: Simulation, dt = 1 / 60) {
      const alpha = simulation.alpha

      if (screenShakeEnabled && !reducedMotion) updateShake(simulation, dt)

      drawBackdrop(simulation)
      drawPlatforms(simulation, alpha)
      drawArrays(simulation)
      drawContact(simulation, alpha)
      drawProjectiles(simulation, alpha)
      drawTracers(simulation)
      drawSun(simulation)
      drawStrike(simulation)

      if (!reducedMotion) drawParticles(simulation)
      drawDeaths(simulation)
      drawFeed(simulation)

      app.render()
    },

    applySettings(settings: RenderSettings) {
      active = paletteFor(settings.colourblindPalette)
      screenShakeEnabled = settings.screenShake
      reducedMotion = settings.reducedMotion

      contactSigs.clear()

      if (reducedMotion || !screenShakeEnabled) {
        shakeEnergy = 0
        shakeX = 0
        shakeY = 0
        recentre()
      }
    },

    toWorld(clientX: number, clientY: number) {
      const rect = app.canvas.getBoundingClientRect()

      return {
        x: (clientX - rect.left - world.x) / world.scale.x,
        y: (clientY - rect.top - world.y) / world.scale.y,
      }
    },

    resize: recentre,

    destroy() {
      if (destroyed) return
      destroyed = true

      app.destroy(true, { children: true })
      platformSprites.clear()
      contactSprites.clear()
      arraySprites.clear()
      projectileSprites.length = 0
      deathSprites.length = 0
      backdropViews = []
      popups.length = 0
    },
  }
}
