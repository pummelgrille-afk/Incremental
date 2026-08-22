import { Application, Assets, Container, Graphics, Sprite, Text, Texture, TextStyle } from 'pixi.js'
import { FLARE, RINGS, RIM_RADIUS, ringByIndex, slotAngle } from '../content/field'
import type { ContactInstance } from '../entities/Contact'
import type { DamageType } from '../entities/types'
import { arrayPosition } from '../systems/ai'
import { attackIntervalOf } from '../systems/buffs'
import { EVENT_LIFETIME } from '../systems/feed'
import { TRACER_LIFETIME } from '../systems/tracers'
import {
  ANIMATION_STATES,
  clipDuration,
  contactState,
  frameIndex,
  platformState,
  type AnimationState,
} from './animation'
import { SPRITE_MANIFEST, spriteFrames } from './assetLoader'
import { TICK_SECONDS, type Simulation } from './loop'

/**
 * The Pixi render layer.
 *
 * **Reads simulation state and never writes it** (docs/architecture.md). A
 * dropped frame must not change the simulation.
 *
 * The simulation runs at a fixed 20 Hz while this draws at display rate, so
 * positions are extrapolated forward by `alpha * TICK_SECONDS` using each
 * entity's velocity. That is cheaper than storing previous positions and
 * interpolating, and exact for the constant-velocity motion that dominates —
 * projectiles and ring rotation.
 *
 * **Art and instrumentation are separate layers**, and Phase 37 fixed the split
 * rather than blurring it. A Contact and the Sun draw a sprite when their
 * content names one; the telegraph ring, the health arc and the Output arc stay
 * vector on top of it. Those are a readout rather than a picture — see
 * docs/design/art-style.md §"Instrumentation is never art" — and a readout
 * baked into a 40px sprite is a readout that stops being legible the moment
 * anything scales.
 *
 * Everything without a sprite is still a Graphics primitive in the palette, and
 * falls back to one silently. Phases 38–40 supply the rest.
 */

const PALETTE = {
  background: 0x0b0a08,
  ringTrack: 0x2a2417,
  sun: 0xc9a227,
  sunLow: 0xf87171,
  platform: 0xc9a227,
  platformDisabled: 0x4a4335,
  detent: 0x8fb3c9,
  pallet: 0xc98f4a,
  array: 0x5eead4,
  contact: 0x8a8474,
  contactFlash: 0xffffff,
  projectileContact: 0xe8e2d4,
  projectileArray: 0x5eead4,
  telegraph: 0xf87171,
  conjunction: 0xfff1a8,
} as const

/**
 * Shot colour by damage type.
 *
 * The type matrix has been in `content/damageTypes.ts` since Phase 8 and has
 * never been visible on the field — a player could see that one unit killed
 * faster than another without any way to see *why*. A tracer is the natural
 * place to say it: it appears exactly when a unit fires, and it costs nothing.
 */
const DAMAGE_COLOURS: Record<DamageType, number> = {
  percussive: 0xd8b45a,
  shear: 0x8fb3c9,
  thermal: 0xe08a4a,
  resonant: 0x5eead4,
}

export interface Renderer {
  render(simulation: Simulation): void
  resize(): void
  destroy(): void
  /** Screen coordinates (clientX/clientY) to simulation world space. */
  toWorld(clientX: number, clientY: number): { x: number; y: number }
  readonly canvas: HTMLCanvasElement
}

/**
 * The sprite key a Contact draws under, or undefined for the primitive.
 *
 * Read from content rather than mapped here, which is what makes `assetKey` a
 * live field rather than the declared-and-unused one it was from Phase 8 until
 * this phase.
 */
const SUN_SPRITE = 'sun'

/**
 * Projectile art, by faction.
 *
 * Hostile fire takes the green comet and owned fire the blue, which is
 * art-style.md §6 rule 1 doing its job: incoming fire is the thing that must be
 * read first, and green against a near-black field at 0.52 saturation is the
 * loudest pair of the two.
 */
const PROJECTILE_SPRITES: Record<'contact' | 'array', string> = {
  contact: 'projectile-1',
  array: 'projectile-2',
}

/**
 * Which way the comet art points, in image space.
 *
 * Measured rather than assumed: the head of both supplied comets sits at 134°
 * and 137° from the sprite's own centroid — down and to the left, since image
 * y grows downward. A sprite is turned by `heading - this`, so a shot travelling
 * along +x puts its head on +x.
 *
 * Both assets agree to within three degrees, so one constant covers them. New
 * comet art must be drawn on the same heading or re-measured; there is no way
 * for the renderer to work it out per texture without inspecting pixels at load
 * time, which is a cost paid on every boot to save an author one convention.
 */
const COMET_HEADING = (135 * Math.PI) / 180

/**
 * Load every sprite in the manifest into a texture, by key.
 *
 * **Nearest-neighbour, always.** These are pixel sprites authored on a 40px
 * grid and drawn at roughly half that; bilinear filtering on pixel art at a
 * non-integer scale is the exact thing art-style.md forbids, and it turns a
 * crisp silhouette into a smear at the size the player actually sees it.
 *
 * A texture that fails to load is skipped rather than thrown: the renderer
 * falls back to the primitive it drew before this phase, and a missing file is
 * a content bug for `tests/assets.test.ts` to fail on — not a black screen.
 */
async function loadTextures(): Promise<Map<string, Texture>> {
  const textures = new Map<string, Texture>()

  await Promise.all(
    Object.entries(SPRITE_MANIFEST).map(async ([key, url]) => {
      try {
        const texture = (await Assets.load(url)) as Texture
        texture.source.scaleMode = 'nearest'
        textures.set(key, texture)
      } catch {
        // Deliberately silent here; the test is where this is caught.
      }
    }),
  )

  return textures
}

/** A sprite sized so its longest edge is `size` px, centred on its position. */
function spriteAt(texture: Texture, size: number): Sprite {
  const sprite = new Sprite(texture)
  sprite.anchor.set(0.5)
  // Scaled by the longest edge rather than per-axis: the supplied art is
  // trimmed to its own bounds, so the two edges differ and stretching each to
  // `size` would distort every sprite by a different amount.
  const scale = size / Math.max(texture.width, texture.height)
  sprite.scale.set(scale)
  return sprite
}

/**
 * A unit's sprite plus where it is in its animation.
 *
 * `clips` is resolved once when the view is created, because the frames a key
 * has cannot change at runtime — the manifest is built at module load. What
 * moves per frame is the state, the clock, and a texture assignment when the
 * index actually changes.
 */
interface AnimatedBody {
  /** The asset key it was built from, so a pooled slot can tell it apart. */
  key: string
  sprite: Sprite
  clips: Record<AnimationState, Texture[]>
  state: AnimationState
  /** Simulation time the current state began. */
  since: number
  /** Last frame assigned, so an unchanged frame costs a comparison. */
  frame: number
}

interface ProjectileView {
  node: Sprite | null
  fallback: Graphics | null
}

interface ContactView {
  node: Container
  body: AnimatedBody | null
  overlay: Graphics
}

/**
 * Build an animated body for a key, or null when nothing is staged under it.
 *
 * Every state resolves to at least one texture where the key exists at all —
 * `spriteFrames` falls back through idle to the bare key — so the render loop
 * never has to handle an empty clip.
 */
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

/**
 * Advance a body to the state it should be in, and to the frame of it.
 *
 * The state clock restarts only when the state *changes*, which is what makes a
 * one-shot clip play from its first frame every time rather than from wherever
 * a shared clock happened to be.
 *
 * A texture is assigned only when the index moves. At 60fps against a 0.16s
 * idle frame that is one assignment in ten, and the other nine cost an integer
 * comparison.
 */
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
    // Cap DPR: a 3x backing store triples fill cost for no legibility gain on
    // shapes this simple.
    resolution: Math.min(window.devicePixelRatio, 2),
    autoDensity: true,
  })
  host.appendChild(app.canvas)

  // Everything is centred on the Sun, so children work in world
  // coordinates and never think about screen space.
  const world = new Container()
  app.stage.addChild(world)

  // --- Static furniture: drawn once, never touched again. -------------------
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

  // --- One container per ring. Rotating it moves every unit on it. ----------
  const ringContainers = RINGS.map(() => {
    const container = new Container()
    world.addChild(container)
    return container
  })

  const textures = await loadTextures()

  const contactLayer = new Container()
  const projectileLayer = new Container()
  const effectLayer = new Container()
  const arrayLayer = new Container()
  world.addChild(contactLayer, arrayLayer, projectileLayer, effectLayer)

  /*
   * The Sun: art underneath, instrumentation on top.
   *
   * The Output arc and the shield ring stay vector, and deliberately. They are
   * a readout — the one number the player must never look away from the field
   * to check (P4) — and a readout drawn at whatever resolution the display has
   * beats one baked into a 40px sprite at any zoom.
   */
  const sunSprite = textures.has(SUN_SPRITE)
    ? spriteAt(textures.get(SUN_SPRITE)!, 58)
    : null
  if (sunSprite) world.addChild(sunSprite)

  const sun = new Graphics()
  world.addChild(sun)

  // Strike feedback lives above everything, so it reads even in dense fire.
  const strikeGraphic = new Graphics()
  effectLayer.addChild(strikeGraphic)

  /*
   * Platform shot tracers.
   *
   * One Graphics for all of them, cleared and rebuilt per frame like the strike
   * — a dozen short lines is far less work than keeping a sprite per tracer in
   * step with a pool that recycles under it.
   *
   * Under the projectile layer deliberately: a tracer is the cheapest thing on
   * screen and must never obscure an incoming shot, which is the one thing a
   * player has to read.
   */
  const tracerGraphic = new Graphics()
  projectileLayer.addChild(tracerGraphic)

  // Damage popups. Text objects are expensive to create, so the pool of them
  // matches the feed's capacity and is allocated once.
  const feedLayer = new Container()
  world.addChild(feedLayer)
  const popupStyle = new TextStyle({
    fontFamily: 'system-ui, sans-serif',
    fontSize: 13,
    fontWeight: '600',
    fill: PALETTE.projectileContact,
  })
  const popups: Text[] = []

  // Sprite registries, keyed by entity id so they survive across frames.
  /*
   * A Platform is a body and an overlay, the same split Contacts use.
   *
   * The body is a planet, chosen by damage type, and it rides the ring
   * container's rotation like everything else on that ring. A planet is round,
   * so the rotation is invisible on it — and the health arc drawn on top *does*
   * turn with the ring, which is correct: it belongs to a unit that is moving.
   */
  const platformSprites = new Map<number, ContactView>()
  /*
   * A Contact is two objects, not one.
   *
   * `body` is the art and never changes shape; `overlay` is the telegraph ring
   * and the health arc, which do. Splitting them is what lets a hit flash cost
   * a tint instead of a geometry rebuild — the signature cache below still
   * guards the overlay, but the expensive half of a flash is gone.
   *
   * A Contact whose def names no sprite has no body and draws its primitive
   * into the overlay, exactly as it did before Phase 37.
   */
  const contactSprites = new Map<number, ContactView>()
  /** Last-drawn signature per Contact, so unchanged ones skip the rebuild. */
  const contactSigs = new Map<number, number>()
  const arraySprites = new Map<number, Graphics>()
  /**
   * One slot per pooled projectile.
   *
   * Two possible display objects rather than one because a slot is recycled
   * between factions, and a faction with no art staged still has to draw. Only
   * ever one of the pair is visible at a time.
   */
  const projectileSprites: ProjectileView[] = []

  const recentre = () => {
    world.x = app.screen.width / 2
    world.y = app.screen.height / 2
    // Scale down on small viewports so the whole field stays visible.
    const fit = Math.min(app.screen.width, app.screen.height) / (RIM_RADIUS * 2.2)
    world.scale.set(Math.min(1, fit))
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
        // 22px across against an 8px body radius, so a planet reads as a body
        // rather than as a dot — the same "art wider than the hitbox" rule the
        // Sun and the Contacts follow.
        const body = animatedBody(textures, platform.def.assetKey, 22)
        const overlay = new Graphics()

        if (body) node.addChild(body.sprite)
        node.addChild(overlay)

        view = { node, body, overlay }
        platformSprites.set(platform.id, view)
        ringContainers[ring.index - 1].addChild(node)
      }

      // Local coordinates only — the parent container's rotation carries them.
      const localAngle = slotAngle(ring, platform.slot.slot, 0)
      view.node.x = Math.cos(localAngle) * ring.radius
      view.node.y = Math.sin(localAngle) * ring.radius

      const sprite = view.overlay

      const disabled = platform.disabledFor > 0
      /*
       * Tinted by damage type, which replaced a table keyed on Platform *id*.
       *
       * That table still held the pre-reskin ids — `hammer`, `detent`,
       * `pallet` — which have not existed since Phase 29 renamed them. Every
       * lookup had missed for eight phases, so all ten Platforms drew in the
       * default colour and the table did nothing whatsoever. Nothing failed;
       * the field quietly lost a distinction it was written to make, which is
       * the dead configuration this project keeps finding.
       *
       * Type is the better key anyway: it is what decides whether a unit
       * answers the Contact in front of it (combat-spec.md §7), it matches the
       * colour its tracer already flies in, and a closed union cannot go stale
       * when the roster is renamed again — the compiler checks it.
       */
      const colour = disabled
        ? PALETTE.platformDisabled
        : DAMAGE_COLOURS[platform.def.damageType]

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

        // A disabled unit dims rather than recolouring: the planet is the
        // unit's identity and must stay recognisable while it is out.
        view.body.sprite.tint = disabled ? PALETTE.platformDisabled : 0xffffff
        view.body.sprite.alpha = disabled ? 0.4 : 1
      } else {
        sprite.circle(0, 0, 8).fill({ color: colour, alpha: disabled ? 0.4 : 1 })
      }

      if (!disabled) {
        // Health ring, so damage is legible without a bar.
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

    // The entire rotation system: one write per ring.
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

      // Charge pips — the resource that makes Arrays burst-y, made visible.
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

  /**
   * Contact are the dominant render cost, so their geometry is only rebuilt when
   * it actually changes.
   *
   * Phase 11 measured ~12 us per Contact per frame against ~4 us for a projectile
   * that is merely repositioned. The difference was `clear()` plus a geometry
   * rebuild every frame for entities that mostly are not changing: an
   * undamaged, non-telegraphing Contact looks identical frame to frame and only
   * needs its position updated.
   *
   * A signature captures everything that affects the drawing. Telegraphing
   * Contact animate, so they are exempt — but only a handful telegraph at once.
   */
  function contactSignature(contact: ContactInstance): number {
    const flashing = contact.hitFlash > 0 ? 1 : 0
    // Health quantised to 20 steps: finer than the eye resolves on a 4 px arc,
    // and it stops a continuous regen trickle from dirtying every frame.
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
        // Art wider than the hitbox, on the same argument the Sun's own
        // comment makes: a near miss should read as a miss.
        const body = animatedBody(textures, contact.def.assetKey, size * 2.6)
        const overlay = new Graphics()

        if (body) node.addChild(body.sprite)
        node.addChild(overlay)

        view = { node, body, overlay }
        contactSprites.set(contact.id, view)
        contactLayer.addChild(node)
        contactSigs.set(contact.id, -1)
      }

      // Position always updates — this is the cheap part.
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
        // The flash is a tint on top of whatever frame is showing, so a unit
        // with no `hit` clip still reads as hit.
        view.body.sprite.tint = contact.hitFlash > 0 ? PALETTE.contactFlash : 0xffffff
      }

      const telegraphing = contact.telegraphRemaining > 0
      const signature = contactSignature(contact)

      // Skip the rebuild when nothing visible changed.
      if (!telegraphing && contactSigs.get(contact.id) === signature) continue
      contactSigs.set(contact.id, telegraphing ? -1 : signature)

      const sprite = view.overlay
      sprite.clear()
      if (!view.body) {
        sprite
          .circle(0, 0, size)
          .fill({ color: contact.hitFlash > 0 ? PALETTE.contactFlash : PALETTE.contact })
      }

      // Telegraph: a pattern that fires without warning is a bug, so the
      // warning has to be visible from the render layer, not implied.
      if (telegraphing) {
        const t = contact.telegraphRemaining
        sprite.circle(0, 0, size + 6 + t * 14).stroke({
          width: 2,
          color: PALETTE.telegraph,
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
      // `destroy({ children: true })` takes the body and the overlay with it;
      // destroying only the container would leak both.
      view.node.destroy({ children: true })
      contactSprites.delete(id)
      contactSigs.delete(id)
    }
  }

  /**
   * Draw the projectiles.
   *
   * The pool's hottest loop — the budget allows 600 live at once — so the
   * shape of this matters more than anywhere else in the file.
   *
   * Sprites where art exists, and a Sprite is *cheaper* than the Graphics it
   * replaces: no geometry, so becoming visible costs a texture assignment and a
   * scale rather than a rebuilt circle. What it adds is a rotation write per
   * projectile per frame, which is one number.
   *
   * Faction is fixed for a projectile's whole life, but the pool recycles a
   * slot between factions, so the texture is set when a slot becomes visible
   * rather than at creation.
   */
  function drawProjectiles(simulation: Simulation, alpha: number) {
    const items = simulation.projectiles.items
    const lead = alpha * TICK_SECONDS

    // Sprites are allocated once and reused by index, matching the pool. No
    // per-frame allocation on the hot path.
    while (projectileSprites.length < items.length) {
      const view: ProjectileView = { node: null, fallback: null }
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
          // Comets carry a tail, so they need more room than the hitbox they
          // stand for — sized on the diameter the collision uses, times two.
          const size = p.radius * 4
          sprite.scale.set(size / Math.max(texture.width, texture.height))
        }

        sprite.x = p.position.x + p.velocity.x * lead
        sprite.y = p.position.y + p.velocity.y * lead
        // Pointed along the shot. A comet flying sideways is worse than a dot.
        sprite.rotation = Math.atan2(p.velocity.y, p.velocity.x) - COMET_HEADING
        continue
      }

      // No art staged for this faction: the disc, exactly as before Phase 37.
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
          color: p.faction === 'contact' ? PALETTE.projectileContact : PALETTE.projectileArray,
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
      // Tinted rather than redrawn: a hit is a white flash and low Output is a
      // red shift, both of which a tint expresses without touching geometry.
      sunSprite.tint = state.hitFlash > 0 ? 0xffffff : low ? PALETTE.sunLow : 0xffffff
      sunSprite.alpha = state.hitFlash > 0 ? 1 : 0.95
    } else {
      sun.circle(0, 0, 26).fill({
        color: state.hitFlash > 0 ? 0xffffff : low ? PALETTE.sunLow : PALETTE.sun,
        alpha: 0.95,
      })
    }

    // Output as an arc around the core — the objective's health is the one
    // number that must never require looking away from the field.
    sun
      .arc(0, 0, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fraction)
      .stroke({ width: 4, color: low ? PALETTE.sunLow : PALETTE.sun })

    if (state.shield > 0) {
      sun.circle(0, 0, 40).stroke({ width: 2, color: PALETTE.array, alpha: 0.6 })
    }
  }

  /**
   * Show where a strike landed.
   *
   * An input with no feedback reads as a broken input, so this draws even when
   * the strike hit nothing at all.
   */
  function drawStrike(simulation: Simulation) {
    const strike = simulation.lastStrike
    strikeGraphic.clear()
    if (!strike) return

    // Expand and fade over the strike's short life.
    const t = Math.min(1, strike.age / 0.35)
    strikeGraphic
      .circle(strike.x, strike.y, FLARE.radius * (0.55 + 0.45 * t))
      .stroke({ width: 3 * (1 - t) + 1, color: PALETTE.conjunction, alpha: 1 - t })
  }

  /**
   * Draw the shot tracers.
   *
   * The bolt travels the line over the tracer's short life while the damage it
   * stands for has already landed — see `systems/tracers.ts` for why it is
   * drawn rather than simulated. Colour is the damage type, which is the one
   * place the type matrix becomes visible on the field rather than in a menu.
   */
  function drawTracers(simulation: Simulation) {
    const tracers = simulation.state.tracers.items
    tracerGraphic.clear()

    for (let i = 0; i < tracers.length; i++) {
      const tracer = tracers[i]
      if (!tracer.active) continue

      const t = Math.min(1, tracer.age / TRACER_LIFETIME)
      const colour = DAMAGE_COLOURS[tracer.damageType]

      // The head runs the whole line across the window; the tail follows a
      // third of a length behind, which is what gives the bolt a direction.
      const head = t
      const tail = Math.max(0, t - 0.34)

      const dx = tracer.toX - tracer.fromX
      const dy = tracer.toY - tracer.fromY

      tracerGraphic
        .moveTo(tracer.fromX + dx * tail, tracer.fromY + dy * tail)
        .lineTo(tracer.fromX + dx * head, tracer.fromY + dy * head)
        .stroke({ width: 2, color: colour, alpha: 0.85 * (1 - t * t) })

      // A muzzle spark at the unit, so a shot reads as *this* unit firing even
      // when the target is off in a crowd.
      if (t < 0.5) {
        tracerGraphic
          .circle(tracer.fromX, tracer.fromY, 3 * (1 - t * 2))
          .fill({ color: colour, alpha: 0.7 })
      }

      // A kill gets a flare at the far end. It is the same information the kill
      // popup carries, placed where the player is already looking.
      if (tracer.lethal && t > 0.35) {
        tracerGraphic
          .circle(tracer.toX, tracer.toY, 4 + 6 * t)
          .stroke({ width: 1.5, color: colour, alpha: 0.8 * (1 - t) })
      }
    }
  }

  /**
   * Death animations, driven by the combat feed.
   *
   * Not by the entity, because there is no entity: `reapContact` removes a
   * Contact the instant it dies, and the def goes with it. The feed is the one
   * thing that outlives a kill — it was built to, so a kill popup could survive
   * the death that produced it — and Phase 38 adds the sprite key to it for
   * exactly this.
   *
   * Pooled against the feed by index, like the popups. A kill that the feed
   * dropped for capacity simply has no death animation, which is the same trade
   * `systems/feed.ts` already makes: unreadable is unreadable.
   */
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

      // A pooled slot is reused by whatever died into it, so the body is
      // rebuilt only when the key changes — a wave of one Contact type reuses
      // the same sprite for every death in it.
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

      // The clock is the event's own age, so the clip starts at the death
      // rather than wherever a shared simulation clock happened to be.
      body.state = 'death'
      const frames = body.clips.death
      const index = frameIndex('death', event.age, frames.length)
      if (index !== body.frame) {
        body.frame = index
        body.sprite.texture = frames[index]
      }

      // Fades over whatever the clip does not cover, so a single-frame death —
      // which is every unit until its art arrives — still reads as a death
      // rather than as a Contact that stopped moving.
      const life = Math.max(clipDuration('death', frames.length), EVENT_LIFETIME)
      body.sprite.alpha = Math.max(0, 1 - event.age / life)
    }
  }

  const FEED_COLOURS: Record<string, number> = {
    damage: 0xe8e2d4,
    kill: PALETTE.sun,
    block: PALETTE.detent,
  }

  /**
   * Draw the combat feed.
   *
   * Text objects are reused by index rather than created per event — creating a
   * Pixi Text allocates a texture, which on a burst of kills would spike the
   * frame far worse than the drawing itself.
   */
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
      popup.style.fill = FEED_COLOURS[event.kind] ?? PALETTE.projectileContact
      // Drift upward and fade, so overlapping numbers separate over time.
      popup.x = event.x
      popup.y = event.y - t * 22
      popup.alpha = 1 - t * t
      popup.scale.set(event.kind === 'kill' ? 1.15 : 1)
    }
  }

  let destroyed = false

  return {
    canvas: app.canvas,

    render(simulation: Simulation) {
      const alpha = simulation.alpha

      drawPlatforms(simulation, alpha)
      drawArrays(simulation)
      drawContact(simulation, alpha)
      drawProjectiles(simulation, alpha)
      drawTracers(simulation)
      drawSun(simulation)
      drawStrike(simulation)
      drawDeaths(simulation)
      drawFeed(simulation)

      app.render()
    },

    toWorld(clientX: number, clientY: number) {
      const rect = app.canvas.getBoundingClientRect()
      // Undo the centring and the fit scale applied in recentre().
      return {
        x: (clientX - rect.left - world.x) / world.scale.x,
        y: (clientY - rect.top - world.y) / world.scale.y,
      }
    },

    resize: recentre,

    destroy() {
      /*
       * Guarded, because Pixi's `destroy` is not idempotent — a second call
       * throws on a half-torn-down Application ("this._cancelResize is not a
       * function"). Svelte can unmount after an explicit teardown, and a
       * teardown path that throws on its second call takes the error handler
       * with it.
       */
      if (destroyed) return
      destroyed = true

      app.destroy(true, { children: true })
      platformSprites.clear()
      contactSprites.clear()
      arraySprites.clear()
      projectileSprites.length = 0
      deathSprites.length = 0
      popups.length = 0
    },
  }
}
