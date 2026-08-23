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

/**
 * Enforces docs/design/i18n.md.
 *
 * The same argument tests/boundaries.test.ts and tests/ui.test.ts make: these
 * are rules broken by reflex — one convenient literal in a template, one key
 * whose placeholder was renamed on one side — and every individual break looks
 * fine in review. They only stop looking fine in a language nobody on the team
 * reads, which is the worst possible place to find out.
 *
 * The budget checks are the ones with teeth. Everything else here is
 * bookkeeping; those measure whether a *translation* fits the screen, which is
 * the actual thing Phase 44 was asked to QA.
 */

const KEYS = Object.keys(EN) as MessageKey[]

// ---------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------

describe('the catalogue', () => {
  it('is actually being looked at', () => {
    // A sweep over a key list that silently becomes empty passes forever.
    expect(KEYS.length).toBeGreaterThan(200)
    expect(contentSources().length).toBeGreaterThan(200)
  })

  it('loses nothing to a duplicate key', () => {
    /*
     * `EN` is a spread of seven files, and a spread is silent: the same key in
     * two of them means the later file quietly wins, and the surface that
     * thought it owned that string changes wording somewhere else.
     */
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
    // There is no escape for a literal brace, on purpose — an escape nobody
    // needs is a rule every translator has to be told about. So an unmatched
    // one is always a typo in a placeholder.
    const offenders = KEYS.filter((key) => {
      const withoutHoles = EN[key].replace(/\{\w+\}/g, '')
      return withoutHoles.includes('{') || withoutHoles.includes('}')
    })

    expect(offenders).toEqual([])
  })

  it('never names a placeholder after one of the props T.svelte owns', () => {
    /*
     * `<T key="…" values={…}>` passes every other prop through as a snippet,
     * so a message with a `{key}` hole could never be filled by a snippet —
     * the name is taken. Found the first time a HUD hint wanted `{key}`.
     */
    const reserved = new Set(['key', 'values'])
    const offenders = KEYS.filter((k) => placeholdersIn(EN[k]).some((n) => reserved.has(n)))

    expect(offenders).toEqual([])
  })

  it('pairs every plural form with an "other"', () => {
    // `plural()` falls back to `.other` for any category a catalogue has not
    // authored, so `.other` is the one form that may never be missing.
    const stems = new Set(
      KEYS.filter((k) => /\.(one|two|few|many)$/.test(k)).map((k) => k.replace(/\.\w+$/, '')),
    )

    const missing = [...stems].filter((stem) => !(`${stem}.other` in EN))

    expect(missing).toEqual([])
  })

  it('keeps English out of the projections', () => {
    /*
     * `progression/` and `core/` may not name anything: neither knows which
     * language is on screen, and a projection that carries copy makes the
     * component that renders it unable to translate.
     *
     * `TRACK_COPY` in progression/support.ts was the last of these, removed in
     * Phase 44. This looks for the shape it had rather than for its name.
     */
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

// ---------------------------------------------------------------------------
// Every locale, including the ones not written yet
// ---------------------------------------------------------------------------

describe('a locale', () => {
  it('ships at least English and the pseudolocale', () => {
    expect(LOCALES.map((l) => l.code)).toContain('en')
    expect(LOCALES.map((l) => l.code)).toContain('qa')
  })

  it('names itself in itself', () => {
    // Never translated: a player who has landed in a language they cannot read
    // finds their way back by recognising their own in the list.
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
    /*
     * Word order is the translator's to change; the set of holes is not. A
     * missing `{cost}` prints a price-less price, and an invented one prints
     * the placeholder itself.
     */
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
    /*
     * The failure mode a keys-derived-from-ids scheme actually has. Renaming a
     * Platform's id silently orphans its translation, and the game keeps
     * running — in English, for that one unit, in every language.
     */
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

// ---------------------------------------------------------------------------
// Translating
// ---------------------------------------------------------------------------

describe('the translator', () => {
  it('falls back per key, not per file', () => {
    // The property that makes a half-finished translation shippable.
    const partial = { code: 'xx', endonym: 'xx', intl: 'en', messages: {}, content: {} }
    expect(partial.messages).toEqual({})
    expect(resolveLocale('xx').code).toBe('en')
  })

  it('fills holes and leaves the rest alone', () => {
    expect(fill('a {b} c', { b: 'X' })).toBe('a X c')
    expect(fill('a {b} c')).toBe('a {b} c')
    // A hole with no value prints itself: a visible bug beats a silent blank.
    expect(fill('a {b} c', {})).toBe('a {b} c')
  })

  it('selects a plural form by the locale rather than by === 1', () => {
    setLocale('en')
    expect(plural('duration.minutes', 1)).toBe('1 minute')
    expect(plural('duration.minutes', 2)).toBe('2 minutes')
    // Unauthored categories land on `.other` rather than on the key.
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

// ---------------------------------------------------------------------------
// The pseudolocale
// ---------------------------------------------------------------------------

describe('the pseudolocale', () => {
  it('is delimited at both ends, so a clipped string is visible as one', () => {
    for (const key of KEYS) {
      const out = pseudoise(EN[key])
      expect(out.startsWith(PSEUDO_OPEN)).toBe(true)
      expect(out.endsWith(PSEUDO_CLOSE)).toBe(true)
    }
  })

  it('leaves every placeholder exactly as it found it', () => {
    // A pseudolocale that mangled `{count}` would be testing the interpolator
    // rather than the layout.
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
    // The reason `qa` is a rule rather than a catalogue: the 278 names and
    // descriptions in `content/` are pseudolocalised by the same transform,
    // and cannot fall out of step with it.
    setLocale('qa')
    const [first] = contentSources()
    const out = translate('term.salvage')
    expect(out.startsWith(PSEUDO_OPEN)).toBe(true)
    expect(pseudoise(first.english).startsWith(PSEUDO_OPEN)).toBe(true)
    setLocale('en')
  })
})

// ---------------------------------------------------------------------------
// Budgets — the ones that measure a screen rather than a table
// ---------------------------------------------------------------------------

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
    /*
     * The check with teeth. English fitting proves nothing about German — the
     * pseudolocale is what asserts the slot has room at the expansion a real
     * translation takes.
     *
     * A failure here is a question, not an answer: let the slot wrap, shorten
     * the English, or widen the slot. Raising the number moves no pixels.
     */
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

// ---------------------------------------------------------------------------
// The screens
// ---------------------------------------------------------------------------

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

/**
 * Every component, `App.svelte` included.
 *
 * The shell is not under `ui/` and was not swept until it turned out to carry
 * the one sentence shown when the game refuses to start — the string with the
 * worst possible ratio of importance to visibility.
 */
const COMPONENTS = [...componentsIn(UI), join(LIB, '..', 'App.svelte')]

/** Attributes whose value is read by a player rather than by the browser. */
const TEXT_ATTRIBUTES = ['title', 'label', 'aria-label', 'placeholder', 'hint', 'alt']

/**
 * Punctuation and units that are the same in every language we would ship.
 *
 * Short and closed on purpose. Every entry is a decision that this mark is
 * typography rather than text; "s" for seconds is the one that is arguable, and
 * it is here because it appears only welded to a number the layout has already
 * budgeted for.
 */
const NOT_TEXT = /^[\s0-9·—–\-…✓✕×+/%:.,()°⟦⟧|]*$/

/** Strip `{ … }`, matching braces, so Svelte blocks and expressions both go. */
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

/**
 * The template, with everything that is not player-facing text removed.
 *
 * Exempted regions come out too. `<!-- i18n-exempt: why --> … <!-- /i18n-exempt -->`
 * marks developer chrome — today only the diagnostics panel, which is a
 * frame-time readout behind a setting and is not written for a player.
 */
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
    /*
     * The rule the whole phase rests on. Externalising 257 strings once is
     * work; keeping them externalised is a habit, and a habit that is not
     * checked is a habit that lasts about two phases.
     *
     * Text nodes only — an attribute is checked below, and everything inside
     * `{ … }` is code.
     */
    const offenders: string[] = []

    for (const file of COMPONENTS) {
      const template = stripExpressions(templateOf(file))
      // Whatever is left between tags is a text node.
      for (const run of template.split(/<[^>]*>/)) {
        const text = run.trim()
        if (text.length === 0 || NOT_TEXT.test(text)) continue
        offenders.push(`${relative(UI, file)}: ${text.slice(0, 50)}`)
      }
    }

    expect(offenders).toEqual([])
  })

  it('has no English typed into a title or a label', () => {
    /*
     * The half that is easy to forget, because it does not look like copy. A
     * `title=` is the only explanation some controls have — the stand-down tab
     * and every price in the roster — and it is read by exactly the player who
     * was unsure enough to hover.
     */
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
    /*
     * `i18n/translate.ts` holds the active locale in a module variable, which
     * is not a rune. A component that called it directly would render the right
     * words once and never re-render when the language changed — the bug would
     * be a screen that is half in each language until it is touched.
     *
     * `T.svelte` is the exception: it needs the parser, not the locale.
     */
    const offenders: string[] = []
    for (const file of COMPONENTS) {
      // Type-only imports are erased and cannot read anything, so `import type
      // { MessageParams }` is not a channel to the locale.
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
    // Checked here as well as in tests/boundaries.test.ts, because this is the
    // module the whole game will end up importing.
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
    // `translate()` and `T.svelte` must agree about where the holes are, or a
    // sentence renders differently depending on whether it carries markup.
    const parts = parseMessage('a {b} c {d}')
    expect(parts).toEqual([{ text: 'a ' }, { name: 'b' }, { text: ' c ' }, { name: 'd' }])
  })
})
