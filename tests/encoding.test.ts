import { describe, expect, it } from 'vitest'
import { decodeBase64, encodeBase64 } from '../src/lib/utils/encoding'
import { checksum, fnv1a } from '../src/lib/utils/hash'

describe('base64', () => {
  it('round-trips ASCII', () => {
    expect(decodeBase64(encodeBase64('hello'))).toBe('hello')
  })

  it('round-trips an empty string', () => {
    expect(decodeBase64(encodeBase64(''))).toBe('')
  })

  it('round-trips characters above 0xFF', () => {
    // btoa throws on these, which is the reason for the TextEncoder step.
    const text = 'em—dash · café · 調整 · 🕰'
    expect(decodeBase64(encodeBase64(text))).toBe(text)
  })

  it('round-trips input larger than the 0x8000 chunk size', () => {
    // Guards the chunking loop: String.fromCharCode(...bytes) blows the stack
    // on large inputs, so encodeBase64 batches. Exercise past one boundary.
    const big = JSON.stringify({ nodes: Array.from({ length: 20_000 }, (_, i) => `node-${i}`) })
    expect(big.length).toBeGreaterThan(0x8000)
    expect(decodeBase64(encodeBase64(big))).toBe(big)
  })

  it('emits standard base64 characters only', () => {
    expect(encodeBase64('some save payload')).toMatch(/^[A-Za-z0-9+/]*={0,2}$/)
  })
})

describe('fnv1a', () => {
  it('is stable for the same input', () => {
    expect(fnv1a('perihelion')).toBe(fnv1a('perihelion'))
  })

  it('differs for different input', () => {
    expect(fnv1a('perihelion')).not.toBe(fnv1a('orrerz'))
  })

  it('detects a single-character change', () => {
    // The failure this guards: a save string that lost or gained one character.
    const a = 'ORRERY-1-payloadpayloadpayload'
    const b = 'ORRERY-1-payloadpaylondpayload'
    expect(fnv1a(a)).not.toBe(fnv1a(b))
  })

  it('stays inside unsigned 32-bit range', () => {
    for (const s of ['', 'a', 'a longer string with spaces', '🕰'.repeat(50)]) {
      const h = fnv1a(s)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThanOrEqual(0xffffffff)
      expect(Number.isInteger(h)).toBe(true)
    }
  })
})

describe('checksum', () => {
  it('is always eight hex characters', () => {
    for (const s of ['', 'a', 'abc', 'x'.repeat(1000)]) {
      expect(checksum(s)).toMatch(/^[0-9a-f]{8}$/)
    }
  })
})
