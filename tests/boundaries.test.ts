import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Enforces the layer boundaries in docs/architecture.md.
 *
 * These rules are the reason combat math and prestige logic stay testable
 * without a DOM. They are easy to break by reflex — one convenient import — and
 * expensive to unpick later, so they are checked mechanically rather than left
 * to review.
 */

const LIB = join(import.meta.dirname, '..', 'src', 'lib')

/** Directories whose modules must run in a plain Node process, no DOM. */
const FRAMEWORK_FREE = ['entities', 'systems', 'content', 'progression', 'utils', 'i18n']

/** render.ts is the sanctioned exception: it is the Pixi layer. */
const PIXI_ALLOWED = [join('core', 'render.ts')]

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

function importsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  const specifiers: string[] = []
  // Covers `import ... from 'x'`, `export ... from 'x'`, and `import('x')`.
  const re = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g
  let match: RegExpExecArray | null
  while ((match = re.exec(source)) !== null) specifiers.push(match[1])
  return specifiers
}

describe('layer boundaries', () => {
  it('keeps the simulation free of Svelte and Pixi', () => {
    const violations: string[] = []

    for (const dir of FRAMEWORK_FREE) {
      for (const file of tsFilesIn(join(LIB, dir))) {
        for (const spec of importsOf(file)) {
          if (spec === 'svelte' || spec.startsWith('svelte/') || spec === 'pixi.js') {
            violations.push(`${relative(LIB, file)} imports ${spec}`)
          }
        }
      }
    }

    expect(violations).toEqual([])
  })

  it('confines Pixi to the render layer', () => {
    const offenders = tsFilesIn(LIB)
      .filter((file) => importsOf(file).some((s) => s === 'pixi.js' || s.startsWith('pixi.js/')))
      .map((file) => relative(LIB, file))
      .filter((rel) => !PIXI_ALLOWED.includes(rel))

    expect(offenders).toEqual([])
  })

  it('keeps core/ free of Svelte', () => {
    const violations = tsFilesIn(join(LIB, 'core'))
      .filter((file) =>
        importsOf(file).some((s) => s === 'svelte' || s.startsWith('svelte/')),
      )
      .map((file) => relative(LIB, file))

    expect(violations).toEqual([])
  })

  it('does not let content reach upward into systems or core', () => {
    // Content is inert data. If it needs logic, the logic belongs elsewhere.
    const violations: string[] = []
    for (const file of tsFilesIn(join(LIB, 'content'))) {
      for (const spec of importsOf(file)) {
        if (spec.includes('../systems/') || spec.includes('../core/')) {
          violations.push(`${relative(LIB, file)} imports ${spec}`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  it('has exactly one barrel', () => {
    const barrels = tsFilesIn(LIB)
      .map((f) => relative(LIB, f))
      .filter((rel) => rel.endsWith('index.ts'))

    expect(barrels).toEqual([join('entities', 'index.ts')])
  })
})
