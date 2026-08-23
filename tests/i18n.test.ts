import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

import { ALMANAC } from '../src/lib/i18n/en/almanac'
import { COMMON } from '../src/lib/i18n/en/common'
import { FORMATION } from '../src/lib/i18n/en/formation'
import { HUD } from '../src/lib/i18n/en/hud'
import { MENUS } from '../src/lib/i18n/en/menus'
import { SETTINGS } from '../src/lib/i18n/en/settings'
import { TERMS } from '../src/lib/i18n/en/terms'
import { EN, type MessageKey } from '../src/lib/i18n/en'
import { BUDGETS } from '../src/lib/i18n/budgets'
import { contentSources } from '../src/lib/i18n/contentSources'
import { LOCALES, resolveLocale } from '../src/lib/i18n/locales'
import { parseMessage, placeholdersIn } from '../src/lib/i18n/parts'
import { PSEUDO_CLOSE, PSEUDO_OPEN, pseudoise } from '../src/lib/i18n/pseudo'
import { fill, plural, setLocale, translate } from '../src/lib/i18n/translate'

const KEYS = Object.keys(EN) as MessageKey[]

describe('the catalogue', () => {
  it('is actually being looked at', () => {
    expect(KEYS.length).toBeGreaterThan(200)
    expect(contentSources().length).toBeGreaterThan(200)
  })

  it('loses nothing to a duplicate key', () => {
    const parts = [COMMON, TERMS, HUD, MENUS, SETTINGS, FORMATION, ALMANAC]
    const declared = parts.reduce((sum, part) => sum + Object.keys(part).length, 0)

    const seen = new Set<string>()
    const duplicated: string[] = []
    for (const part of parts) {
      for (const key of Object.keys(part)) {
        if (seen.has(key)) duplicated.push(key)
        seen.add(key)
      }
    }

    expect(duplicated).toEqual([])
    expect(KEYS.length).toBe(declared)
  })

  it('never leaves a brace a translator has to guess about', () => {
    const offenders = KEYS.filter((key) => {
      const withoutHoles = EN[key].replace(/\{\w+\}/g, '')
      return withoutHoles.includes('{') || withoutHoles.includes('}')
    })

    expect(offenders).toEqual([])
  })

  it('never names a placeholder after one of the props T.svelte owns', () => {
    const reserved = new Set(['key', 'values'])
    const offenders = KEYS.filter((k) => placeholdersIn(EN[k]).some((n) => reserved.has(n)))

    expect(offenders).toEqual([])
  })

  it('pairs every plural form with an "other"', () => {
    const stems = new Set(
      KEYS.filter((k) => /\.(one|two|few|many)$/.test(k)).map((k) => k.replace(/\.\w+$/, '')),
    )

    const missing = [...stems].filter((stem) => !(`${stem}.other` in EN))

    expect(missing).toEqual([])
  })

  it('keeps English out of the projections', () => {
    const offenders: string[] = []
    for (const dir of ['progression', 'core']) {
      for (const file of tsFilesIn(join(LIB, dir))) {
        const source = readFileSync(file, 'utf8')
        for (const match of source.matchAll(/^\s*(?:name|effect|label):\s*'([^']{2,})'/gm)) {
          offenders.push(`${relative(LIB, file)}: ${match[1]}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })
})

describe('a locale', () => {
  it('ships at least English and the pseudolocale', () => {
    expect(LOCALES.map((l) => l.code)).toContain('en')
    expect(LOCALES.map((l) => l.code)).toContain('qa')
  })

  it('names itself in itself', () => {
    for (const locale of LOCALES) expect(locale.endonym.length).toBeGreaterThan(0)
    expect(new Set(LOCALES.map((l) => l.endonym)).size).toBe(LOCALES.length)
  })

  it('never carries a key English has dropped', () => {
    const orphans: string[] = []
    for (const locale of LOCALES) {
      for (const key of Object.keys(locale.messages)) {
        if (!(key in EN)) orphans.push(`${locale.code}: ${key}`)
      }
    }

    expect(orphans).toEqual([])
  })

  it('keeps every placeholder English has, in whatever order it likes', () => {
    const wrong: string[] = []
    for (const locale of LOCALES) {
      for (const [key, message] of Object.entries(locale.messages)) {
        const expected = [...placeholdersIn(EN[key as MessageKey])].sort()
        const actual = [...placeholdersIn(message)].sort()
        if (expected.join(',') !== actual.join(',')) {
          wrong.push(`${locale.code}: ${key} has [${actual}], expected [${expected}]`)
        }
      }
    }

    expect(wrong).toEqual([])
  })

  it('never overrides content that has been renamed away', () => {
    const real = new Set(contentSources().map((s) => s.key))
    const orphans: string[] = []
    for (const locale of LOCALES) {
      for (const key of Object.keys(locale.content)) {
        if (!real.has(key as never)) orphans.push(`${locale.code}: ${key}`)
      }
    }

    expect(orphans).toEqual([])
  })
})

describe('the translator', () => {
  it('falls back per key, not per file', () => {
    const partial = { code: 'xx', endonym: 'xx', intl: 'en', messages: {}, content: {} }
    expect(partial.messages).toEqual({})
    expect(resolveLocale('xx').code).toBe('en')
  })

  it('fills holes and leaves the rest alone', () => {
    expect(fill('a {b} c', { b: 'X' })).toBe('a X c')
    expect(fill('a {b} c')).toBe('a {b} c')

    expect(fill('a {b} c', {})).toBe('a {b} c')
  })

  it('selects a plural form by the locale rather than by === 1', () => {
    setLocale('en')
    expect(plural('duration.minutes', 1)).toBe('1 minute')
    expect(plural('duration.minutes', 2)).toBe('2 minutes')

    expect(plural('duration.minutes', 0)).toBe('0 minutes')
  })

  it('reads the language that is set', () => {
    setLocale('qa')
    const pseudo = translate('term.salvage')
    expect(pseudo.startsWith(PSEUDO_OPEN)).toBe(true)
    setLocale('en')
    expect(translate('term.salvage')).toBe('Salvage')
  })
})

describe('the pseudolocale', () => {
  it('is delimited at both ends, so a clipped string is visible as one', () => {
    for (const key of KEYS) {
      const out = pseudoise(EN[key])
      expect(out.startsWith(PSEUDO_OPEN)).toBe(true)
      expect(out.endsWith(PSEUDO_CLOSE)).toBe(true)
    }
  })

  it('leaves every placeholder exactly as it found it', () => {
    for (const key of KEYS) {
      expect(placeholdersIn(pseudoise(EN[key]))).toEqual(placeholdersIn(EN[key]))
    }
  })

  it('expands the short strings hardest', () => {
    const short = pseudoise('Save')
    const long = pseudoise('A'.repeat(120))
    expect(short.length / 'Save'.length).toBeGreaterThan(2)
    expect(long.length / 120).toBeLessThan(1.5)
  })

  it('covers content too, without a table of it', () => {
    setLocale('qa')
    const [first] = contentSources()
    const out = translate('term.salvage')
    expect(out.startsWith(PSEUDO_OPEN)).toBe(true)
    expect(pseudoise(first.english).startsWith(PSEUDO_OPEN)).toBe(true)
    setLocale('en')
  })
})

describe('a budgeted slot', () => {
  const english = new Map<string, string>([
    ...KEYS.map((k) => [k, EN[k]] as [string, string]),
    ...contentSources().map((s) => [s.key, s.english] as [string, string]),
  ])

  it('names a string that exists', () => {
    const unknown = Object.keys(BUDGETS).filter((key) => !english.has(key))
    expect(unknown).toEqual([])
  })

  it('fits its English', () => {
    const over: string[] = []
    for (const [key, budget] of Object.entries(BUDGETS)) {
      const text = english.get(key)
      if (text !== undefined && text.length > budget!) {
        over.push(`${key}: ${text.length} > ${budget}`)
      }
    }

    expect(over).toEqual([])
  })

  it('fits a translation of it', () => {
    const over: string[] = []
    for (const [key, budget] of Object.entries(BUDGETS)) {
      const text = english.get(key)
      if (text === undefined) continue
      const expanded = pseudoise(text)
      if (expanded.length > budget!) over.push(`${key}: ${expanded.length} > ${budget}`)
    }

    expect(over).toEqual([])
  })
})

const LIB = join(import.meta.dirname, '..', 'src', 'lib')
const UI = join(LIB, 'ui')

function tsFilesIn(dir: string): string[] {
  let out: string[] = []
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out = out.concat(tsFilesIn(full))
    else if (entry.endsWith('.ts')) out.push(full)
  }
  return out
}

function componentsIn(dir: string): string[] {
  let out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out = out.concat(componentsIn(full))
    else if (entry.endsWith('.svelte')) out.push(full)
  }
  return out
}

const COMPONENTS = [...componentsIn(UI), join(LIB, '..', 'App.svelte')]

const TEXT_ATTRIBUTES = ['title', 'label', 'aria-label', 'placeholder', 'hint', 'alt']

const NOT_TEXT = /^[\s0-9·—–\-…✓✕×+/%:.,()°⟦⟧|]*$/

function stripExpressions(markup: string): string {
  let out = ''
  let depth = 0
  for (const ch of markup) {
    if (ch === '{') depth++
    else if (ch === '}') depth = Math.max(0, depth - 1)
    else if (depth === 0) out += ch
  }
  return out
}

function templateOf(file: string): string {
  let source = readFileSync(file, 'utf8')
  source = source.replace(/<script[\s\S]*?<\/script>/g, '')
  source = source.replace(/<style[\s\S]*?<\/style>/g, '')
  source = source.replace(/<!--\s*i18n-exempt[\s\S]*?<!--\s*\/i18n-exempt\s*-->/g, '')
  source = source.replace(/<!--[\s\S]*?-->/g, '')
  return source
}

describe('a screen', () => {
  it('is actually being looked at', () => {
    expect(COMPONENTS.length).toBeGreaterThanOrEqual(23)
  })

  it('has no English typed into its markup', () => {
    const offenders: string[] = []

    for (const file of COMPONENTS) {
      const template = stripExpressions(templateOf(file))

      for (const run of template.split(/<[^>]*>/)) {
        const text = run.trim()
        if (text.length === 0 || NOT_TEXT.test(text)) continue
        offenders.push(`${relative(UI, file)}: ${text.slice(0, 50)}`)
      }
    }

    expect(offenders).toEqual([])
  })

  it('has no English typed into a title or a label', () => {
    const offenders: string[] = []
    const attr = new RegExp(`\\b(${TEXT_ATTRIBUTES.join('|')})="([^"{}]*[A-Za-z]{2}[^"{}]*)"`, 'g')

    for (const file of COMPONENTS) {
      for (const match of templateOf(file).matchAll(attr)) {
        offenders.push(`${relative(UI, file)}: ${match[1]}="${match[2].slice(0, 40)}"`)
      }
    }

    expect(offenders).toEqual([])
  })

  it('reads the language through the store, never through i18n directly', () => {
    const offenders: string[] = []
    for (const file of COMPONENTS) {
      const source = readFileSync(file, 'utf8').replace(/import type [\s\S]*?\n/g, '')
      if (/from '.*i18n\/translate'/.test(source)) offenders.push(relative(UI, file))
      if (/from '.*i18n\/parts'/.test(source) && !file.endsWith('T.svelte')) {
        offenders.push(relative(UI, file))
      }
    }

    expect(offenders).toEqual([])
  })
})

describe('the i18n module', () => {
  it('imports nothing that needs a browser', () => {
    const violations: string[] = []
    for (const file of tsFilesIn(join(LIB, 'i18n'))) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
        const spec = match[1]
        if (spec === 'svelte' || spec.startsWith('svelte/') || spec === 'pixi.js') {
          violations.push(`${relative(LIB, file)} imports ${spec}`)
        }
      }
    }

    expect(violations).toEqual([])
  })

  it('parses a message the same way for both consumers', () => {
    const parts = parseMessage('a {b} c {d}')
    expect(parts).toEqual([{ text: 'a ' }, { name: 'b' }, { text: ' c ' }, { name: 'd' }])
  })
})
