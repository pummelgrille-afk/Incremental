import { describe, expect, it } from 'vitest'
import {
  hasSprite,
  missingSprites,
  SPRITE_KEYS,
  SPRITE_MANIFEST,
  spriteUrl,
  unusedSprites,
} from '../src/lib/core/assetLoader'
import { CONTACT } from '../src/lib/content/contacts'
import { PLATFORMS } from '../src/lib/content/platforms'
import { ARRAYS } from '../src/lib/content/arrays'

/** Every asset key content references today. */
const referenced = [
  ...CONTACT.map((c) => c.assetKey),
  ...PLATFORMS.map((p) => p.assetKey),
  ...ARRAYS.map((a) => a.assetKey),
  // The Sun and the two projectile sprites are not content — a projectile is
  // pooled and typed by faction, not by def — so their keys live in render.ts.
  'sun',
  'projectile-1',
  'projectile-2',
]

describe('the sprite manifest', () => {
  it('finds the staged sprites', () => {
    expect(SPRITE_KEYS.length).toBeGreaterThan(0)
    expect(SPRITE_KEYS).toContain('sun')
  })

  it('keys them by filename without the extension', () => {
    for (const key of SPRITE_KEYS) {
      expect(key).not.toContain('/')
      expect(key).not.toContain('.png')
    }
  })

  it('leaves the supplied originals out of the bundle', () => {
    /*
     * `raw/` holds the art as it was handed over — JPEG-smeared, ~500px, a
     * hundred times the size of what the game draws. The glob is one level deep
     * precisely so those never reach a build; if this fails, a 1.3MB payload
     * has just been added to the download for files nothing renders.
     */
    for (const url of Object.values(SPRITE_MANIFEST)) {
      expect(url).not.toContain('/raw/')
    }
  })

  it('resolves a key to a url and an unknown key to null', () => {
    expect(spriteUrl('sun')).toBeTruthy()
    expect(spriteUrl('no-such-sprite')).toBeNull()
    expect(hasSprite('no-such-sprite')).toBe(false)
  })
})

describe('content and art agree', () => {
  it('references nothing that is not staged', () => {
    /*
     * The failure this exists to catch is silent: the renderer falls back to
     * its primitive when a texture is missing, so a mistyped `assetKey` looks
     * exactly like art that has not been drawn yet. Caught here instead.
     */
    expect(missingSprites(referenced)).toEqual([])
  })

  it('gives every Contact a sprite', () => {
    // Ten identical grey circles is what this replaced. A Contact with no key
    // would silently go back to being one.
    for (const contact of CONTACT) {
      expect(contact.assetKey, contact.id).toBeDefined()
    }
  })

  it('distinguishes the three tiers by silhouette', () => {
    // Tier is what changes how a wave must be answered (contacts.ts), so it is
    // the distinction the art has to carry while there is one sprite per tier
    // rather than one per craft.
    const byTier = new Map<string, Set<string>>()
    for (const contact of CONTACT) {
      const keys = byTier.get(contact.tier) ?? new Set<string>()
      keys.add(contact.assetKey!)
      byTier.set(contact.tier, keys)
    }

    for (const [tier, keys] of byTier) {
      expect(keys.size, `${tier} uses more than one sprite`).toBe(1)
    }

    const perTier = [...byTier.values()].map((keys) => [...keys][0])
    expect(new Set(perTier).size, 'two tiers share a sprite').toBe(byTier.size)
  })

  it('gives every Platform a sprite, one planet per damage type', () => {
    /*
     * Four types, four planets, and the planet's dominant hue sits beside its
     * type's colour — so a Platform and the tracer it fires agree, which is the
     * rule art-style.md §1 already sets for the tint.
     */
    const byType = new Map<string, Set<string>>()
    for (const platform of PLATFORMS) {
      expect(platform.assetKey, platform.id).toBeDefined()
      const keys = byType.get(platform.damageType) ?? new Set<string>()
      keys.add(platform.assetKey!)
      byType.set(platform.damageType, keys)
    }

    for (const [type, keys] of byType) {
      expect(keys.size, `${type} uses more than one planet`).toBe(1)
    }

    const perType = [...byType.values()].map((keys) => [...keys][0])
    expect(new Set(perType).size, 'two types share a planet').toBe(byType.size)
  })

  it('leaves nothing staged and unused', () => {
    // Every supplied sprite is on screen. If art is added ahead of the content
    // that uses it, this is the reminder — it is meant to be edited when that
    // happens, not deleted.
    expect(unusedSprites(referenced)).toEqual([])
  })
})
