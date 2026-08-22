import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Enforces the primitive set in docs/design/ui-spec.md.
 *
 * The same argument tests/boundaries.test.ts makes about layers: these rules
 * are broken by reflex — one convenient `<button>`, one `z-index: 21` — and the
 * damage is invisible in review because each individual copy looks fine. It is
 * only fine until there are five of them with three different disabled states,
 * which is exactly where Phase 42 found this codebase.
 *
 * Nothing here is about taste. Every rule below names a specific thing that had
 * already drifted.
 */

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

/** The `<style>` block only. Prose in a comment is not a style rule. */
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
    // A sweep over a file list that silently becomes empty passes forever.
    expect(PRIMITIVE_FILES.length).toBeGreaterThanOrEqual(8)
    expect(SCREENS.length).toBeGreaterThanOrEqual(8)
  })

  it('is where every button is styled', () => {
    /*
     * Five components each carried their own `button { … }` before Phase 42,
     * and they had drifted: two padding scales, two radii, and a disabled state
     * that was a flat grey in four and a lowered opacity in the fifth.
     *
     * A component may still style a *named* control that is not an action —
     * StageSelect's `.stage` is a place on a map, not one of Button's three
     * variants — so the rule is about the bare element selector.
     */
    const offenders = SCREENS.filter((file) => /^\s*button\s*[{,:]/m.test(styleOf(file))).map(name)

    expect(offenders).toEqual([])
  })

  it('is where every keycap is styled', () => {
    // The same `kbd` rule had been retyped in four components.
    const offenders = SCREENS.filter((file) => /^\s*kbd\s*[{,:]/m.test(styleOf(file))).map(name)

    expect(offenders).toEqual([])
  })

  it('is where every dialog is built', () => {
    /*
     * Three components each hand-rolled a scrim, a centred box, click-outside
     * and an Escape handler. Three copies meant three scrim alphas — 0.72, 0.80
     * and 0.82 — chosen one at a time, and none of the three moved focus into
     * the panel it had just opened.
     */
    const offenders = SCREENS.filter((file) => {
      const source = readFileSync(file, 'utf8')
      return source.includes('role="dialog"') || /\.scrim\s*\{/.test(source)
    }).map(name)

    expect(offenders).toEqual([])
  })
})

describe('the stacking order', () => {
  it('is named, never a bare number', () => {
    /*
     * `z-index: 10 | 15 | 20 | 30` were chosen independently across six files
     * with nothing anywhere saying what the order *was*. The tokens in
     * app.css say it once; a literal here means someone has guessed again.
     */
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
    /*
     * The line that keeps this set reusable. A primitive that reaches into the
     * store is a screen with fewer props — it can only be used where that state
     * means what it meant the first time, and the next caller ends up copying
     * it rather than using it.
     */
    const offenders = PRIMITIVE_FILES.filter((file) =>
      /from\s+'[^']*stores\//.test(readFileSync(file, 'utf8')),
    ).map(name)

    expect(offenders).toEqual([])
  })

  it('never imports another screen', () => {
    // Primitives compose with each other and with content passed in. One
    // importing a screen would invert the dependency and close the cycle.
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
    /*
     * Each of these had been written out by hand in three or more files, which
     * is how the danger red ended up meaning both "the Sun is dying" and "this
     * control is disabled" depending on which component you were looking at.
     */
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
