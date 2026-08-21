import { describe, expect, it } from 'vitest'
import { formatNumber, formatRate, formatDuration } from './format'

describe('formatNumber', () => {
  it('leaves small integers alone', () => {
    expect(formatNumber(0)).toBe('0')
    expect(formatNumber(999)).toBe('999')
  })

  it('applies suffixes at each power of a thousand', () => {
    expect(formatNumber(1000)).toBe('1.00K')
    expect(formatNumber(1_234_567)).toBe('1.23M')
    expect(formatNumber(5e12)).toBe('5.00T')
  })

  it('falls back to exponential past the named suffixes', () => {
    expect(formatNumber(1e40)).toBe('1.00e+40')
  })

  it('handles negatives and infinity', () => {
    expect(formatNumber(-2500)).toBe('-2.50K')
    expect(formatNumber(Infinity)).toBe('∞')
  })
})

describe('formatRate', () => {
  it('signs positive rates explicitly', () => {
    expect(formatRate(12)).toBe('+12/s')
    expect(formatRate(-3)).toBe('-3/s')
  })
})

describe('formatDuration', () => {
  it('scales units with the elapsed time', () => {
    expect(formatDuration(45)).toBe('45s')
    expect(formatDuration(125)).toBe('2m 5s')
    expect(formatDuration(7500)).toBe('2h 5m')
  })
})
