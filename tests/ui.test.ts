import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const UI = join(import.meta.dirname, '..', 'src', 'lib', 'ui')
const PRIMITIVES = join(UI, 'primitives')

function componentsIn(dir: string): string[] {
  let out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out = out.concat(componentsIn(full))
    else if (entry.endsWith('.svelte')) out.push(full)
  }
  return out
}

const ALL = componentsIn(UI)
const SCREENS = ALL.filter((f) => !f.startsWith(PRIMITIVES))
const PRIMITIVE_FILES = ALL.filter((f) => f.startsWith(PRIMITIVES))

function styleOf(file: string): string {
  const source = readFileSync(file, 'utf8')
  const start = source.indexOf('<style>')
  return start === -1 ? '' : source.slice(start)
}

function name(file: string): string {
  return relative(UI, file)
}

describe('the primitive set', () => {
  it('is actually being looked at', () => {
    expect(PRIMITIVE_FILES.length).toBeGreaterThanOrEqual(12)
    expect(SCREENS.length).toBeGreaterThanOrEqual(10)
  })

  it('is where every button is styled', () => {
    const offenders = SCREENS.filter((file) => /^\s*button\s*[{,:]/m.test(styleOf(file))).map(name)

    expect(offenders).toEqual([])
  })

  it('is where every keycap is styled', () => {
    const offenders = SCREENS.filter((file) => /^\s*kbd\s*[{,:]/m.test(styleOf(file))).map(name)

    expect(offenders).toEqual([])
  })

  it('is where every dialog is built', () => {
    const offenders = SCREENS.filter((file) => {
      const source = readFileSync(file, 'utf8')
      return source.includes('role="dialog"') || /\.scrim\s*\{/.test(source)
    }).map(name)

    expect(offenders).toEqual([])
  })
})

describe('the stacking order', () => {
  it('is named, never a bare number', () => {
    const offenders: string[] = []

    for (const file of ALL) {
      for (const match of styleOf(file).matchAll(/z-index:\s*([^;]+);/g)) {
        if (!match[1].includes('var(--z-')) offenders.push(`${name(file)}: ${match[1].trim()}`)
      }
    }

    expect(offenders).toEqual([])
  })
})

describe('a primitive', () => {
  it('never reads the game', () => {
    const offenders = PRIMITIVE_FILES.filter((file) =>
      /from\s+'[^']*stores\//.test(readFileSync(file, 'utf8')),
    ).map(name)

    expect(offenders).toEqual([])
  })

  it('never imports another screen', () => {
    const offenders: string[] = []

    for (const file of PRIMITIVE_FILES) {
      for (const match of readFileSync(file, 'utf8').matchAll(/from\s+'([^']+\.svelte)'/g)) {
        if (!match[1].startsWith('./')) offenders.push(`${name(file)} imports ${match[1]}`)
      }
    }

    expect(offenders).toEqual([])
  })
})

describe('the palette', () => {
  it('is read from tokens, not retyped', () => {
    const retyped: Record<string, string> = {
      '#f87171': '--danger',
      '#f0b06c': '--warn',
      '#1c1a14': '--well',
      '#2a2620': '--inert',
    }

    const offenders: string[] = []

    for (const file of ALL) {
      const style = styleOf(file)
      for (const [literal, token] of Object.entries(retyped)) {
        if (style.includes(literal)) offenders.push(`${name(file)}: ${literal} → var(${token})`)
      }
    }

    expect(offenders).toEqual([])
  })
})

describe('the keyboard', () => {
  it('leaves Escape to the one handler that knows the stacking order', () => {
    const offenders = ALL.filter((file) => {
      const source = readFileSync(file, 'utf8')
      return /<svelte:window[^>]*onkeydown/.test(source)
    }).map(name)

    expect(offenders).toEqual([])
  })

  it('draws its own focus ring wherever it can land', () => {
    const interactive = /^\s*(button|input|textarea|\.stage|\.option)\s*[{,:]/m
    const offenders = ALL.filter((file) => {
      const style = styleOf(file)
      return interactive.test(style) && !style.includes(':focus-visible')
    }).map(name)

    expect(offenders).toEqual([])
  })
})

describe('a control', () => {
  it('is a real element, not a div wearing a role', () => {
    for (const file of ['Toggle.svelte', 'Choice.svelte', 'Slider.svelte']) {
      const source = readFileSync(join(PRIMITIVES, file), 'utf8')
      expect(source, file).toMatch(/<input[\s>]/)
    }
  })
})
