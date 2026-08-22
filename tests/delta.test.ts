import { describe, expect, it } from 'vitest'
import { PooledDelta } from '../src/lib/utils/delta'

/**
 * The HUD's gain and loss readouts, as arithmetic.
 *
 * Everything interesting about them is here rather than in a component: how
 * fast movement pools, when it expires, and what happens when a number moves
 * both ways inside one window. A `.svelte` file cannot be asked any of that.
 */

const WINDOW = 1.1

describe('pooling', () => {
  it('adopts the first value in silence', () => {
    // Otherwise a loaded save's whole balance animates as though just earned.
    const d = new PooledDelta(WINDOW)
    d.push(880, 0)

    expect(d.gain).toBe(0)
    expect(d.loss).toBe(0)
  })

  it('accumulates a rise rather than reporting each step', () => {
    // Twenty kills in a second is one "+240", not twenty floats.
    const d = new PooledDelta(WINDOW)
    d.push(0, 0)
    for (let i = 1; i <= 20; i++) d.push(i * 12, i * 0.02)

    expect(d.gain).toBe(240)
  })

  it('accumulates a fall the same way, as a positive figure', () => {
    const d = new PooledDelta(WINDOW)
    d.push(1000, 0)
    d.push(940, 0.1)
    d.push(880, 0.2)

    expect(d.loss).toBe(120)
    expect(d.gain).toBe(0)
  })

  it('expires a pool once the window has passed', () => {
    const d = new PooledDelta(WINDOW)
    d.push(0, 0)
    d.push(50, 0)
    expect(d.gain).toBe(50)

    d.push(50, WINDOW)
    expect(d.gain).toBe(0)
  })

  it('extends the window while movement continues', () => {
    // A sustained stream must not blink out mid-stream at a fixed age.
    const d = new PooledDelta(WINDOW)
    d.push(0, 0)
    for (let t = 0; t <= 4; t += 0.5) d.push(t * 100 + 100, t)

    expect(d.gain).toBeGreaterThan(0)
  })
})

describe('the freshest movement wins', () => {
  it('clears a standing gain when the value falls', () => {
    // Spending Salvage must not leave the kill that funded it advertised.
    const d = new PooledDelta(WINDOW)
    d.push(100, 0)
    d.push(160, 0.1)
    expect(d.gain).toBe(60)

    d.push(110, 0.2)
    expect(d.gain).toBe(0)
    expect(d.loss).toBe(50)
  })

  it('clears a standing loss when the value rises', () => {
    // Repairing the Sun mid-wave: the damage is over, say so.
    const d = new PooledDelta(WINDOW)
    d.push(1000, 0)
    d.push(700, 0.1)
    expect(d.loss).toBe(300)

    d.push(900, 0.2)
    expect(d.loss).toBe(0)
    expect(d.gain).toBe(200)
  })

  it('leaves both pools alone when nothing moved', () => {
    const d = new PooledDelta(WINDOW)
    d.push(100, 0)
    d.push(140, 0.1)
    d.push(140, 0.2)

    expect(d.gain).toBe(40)
  })
})

describe('priming and clearing', () => {
  it('primes a value without reporting it', () => {
    const d = new PooledDelta(WINDOW)
    d.prime(880)
    expect(d.gain).toBe(0)

    d.push(890, 0.5)
    expect(d.gain).toBe(10)
  })

  it('drops what it knew, so the next push is silent again', () => {
    // What a stage load needs: full Output on a fresh stage is not a heal.
    const d = new PooledDelta(WINDOW)
    d.push(1000, 0)
    d.push(400, 0.5)
    expect(d.loss).toBe(600)

    d.clear()
    d.push(1000, 0)
    expect(d.gain).toBe(0)
    expect(d.loss).toBe(0)
  })
})
