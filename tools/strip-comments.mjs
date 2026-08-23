/**
 * Remove comments from source, in place.
 *
 *     node tools/strip-comments.mjs [--dry]
 *
 * Uses TypeScript's own parser to find comment ranges rather than a regex: a
 * regex literal like /from '.*i18n\/translate'/ contains what looks exactly
 * like a line comment, and a character-by-character stripper eats the rest of
 * the line. The parser knows the difference.
 *
 * Directive comments are kept — svelte-ignore, i18n-exempt, @ts-*, shebangs —
 * because those are instructions to a tool rather than prose for a reader.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readdirSync, statSync } from 'node:fs'
import ts from 'typescript'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DRY = process.argv.includes('--dry')

/** Comments that are instructions, not prose. Never removed. */
const KEEP = [
  'svelte-ignore',
  'i18n-exempt',
  '/i18n-exempt',
  '@ts-ignore',
  '@ts-expect-error',
  '@ts-nocheck',
  'eslint-',
  'prettier-ignore',
  '<reference',
  '@vite-ignore',
]

/**
 * A directive *starts* with its marker.
 *
 * Matching anywhere kept the docblock in tests/i18n.test.ts that merely
 * explains what `i18n-exempt` does — prose about a directive is still prose.
 */
function keep(text) {
  const body = text
    .replace(/^<!--|^\/\*+|^\/\/|-->$|\*+\/$/g, '')
    .trim()
  return KEEP.some((marker) => body.startsWith(marker))
}

// ---------------------------------------------------------------------------
// TypeScript / JavaScript
// ---------------------------------------------------------------------------

/** Every comment range in a TS/JS source, via the parser. */
function commentRanges(text, kind) {
  const source = ts.createSourceFile('x.ts', text, ts.ScriptTarget.Latest, true, kind)
  const found = new Map()

  const collect = (pos) => {
    for (const fn of [ts.getLeadingCommentRanges, ts.getTrailingCommentRanges]) {
      for (const range of fn(text, pos) ?? []) found.set(range.pos, range)
    }
  }

  const visit = (node) => {
    collect(node.pos)
    for (const child of node.getChildren(source)) visit(child)
  }
  visit(source)

  return [...found.values()].sort((a, b) => a.pos - b.pos)
}

function stripTs(text, kind = ts.ScriptKind.TS) {
  const ranges = commentRanges(text, kind).filter((r) => !keep(text.slice(r.pos, r.end)))
  let out = ''
  let last = 0
  for (const range of ranges) {
    out += text.slice(last, range.pos)
    last = range.end
  }
  return out + text.slice(last)
}

// ---------------------------------------------------------------------------
// CSS and HTML, which the TypeScript parser knows nothing about
// ---------------------------------------------------------------------------

/** `/* … *\/`, but not inside a string or a url(). */
function stripCss(text) {
  let out = ''
  let i = 0
  let quote = null
  while (i < text.length) {
    const ch = text[i]
    if (quote) {
      out += ch
      if (ch === '\\') { out += text[i + 1] ?? ''; i += 2; continue }
      if (ch === quote) quote = null
      i++
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; out += ch; i++; continue }
    if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      const stop = end === -1 ? text.length : end + 2
      if (keep(text.slice(i, stop))) { out += text.slice(i, stop) }
      i = stop
      continue
    }
    out += ch
    i++
  }
  return out
}

function stripHtml(text) {
  return text.replace(/<!--[\s\S]*?-->/g, (m) => (keep(m) ? m : ''))
}

/**
 * Svelte template text: HTML comments, and the JavaScript inside `{ … }`.
 *
 * The expressions are the half that is easy to miss — a `{(e) => { … }}`
 * handler is a function body in the middle of markup, and the biggest comment
 * in the Almanac was sitting in one.
 *
 * Block tags (`{#if}`, `{:else}`, `{/each}`) are matched so their braces do not
 * confuse the nesting, and then left alone.
 */
function stripTemplate(text) {
  let out = ''
  let i = 0
  while (i < text.length) {
    if (text[i] !== '{') {
      out += text[i]
      i++
      continue
    }

    let depth = 0
    let quote = null
    let j = i
    for (; j < text.length; j++) {
      const ch = text[j]
      if (quote) {
        if (ch === '\\') { j++; continue }
        if (ch === quote) quote = null
        continue
      }
      if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue }
      if (ch === '{') depth++
      else if (ch === '}') { depth--; if (depth === 0) break }
    }

    if (j >= text.length) { out += text.slice(i); break }

    const inner = text.slice(i + 1, j)
    const tag = /^\s*[#/:@]/.test(inner)
    out += '{' + (tag ? inner : stripTs(inner)) + '}'
    i = j + 1
  }
  return out
}

// ---------------------------------------------------------------------------
// Svelte: three languages in one file
// ---------------------------------------------------------------------------

function stripSvelte(text) {
  const regions = []
  const tagged = /<(script|style)(\s[^>]*)?>([\s\S]*?)<\/\1>/g
  let match
  while ((match = tagged.exec(text)) !== null) {
    regions.push({
      start: match.index + match[0].indexOf(match[3], match[1].length),
      end: match.index + match[0].length - `</${match[1]}>`.length,
      lang: match[1],
    })
  }

  const template = (part) => stripTemplate(stripHtml(part))

  let out = ''
  let last = 0
  for (const region of regions) {
    out += template(text.slice(last, region.start))
    const body = text.slice(region.start, region.end)
    out += region.lang === 'script' ? stripTs(body) : stripCss(body)
    last = region.end
  }
  return out + template(text.slice(last))
}

// ---------------------------------------------------------------------------
// Python: `#` comments only. A docstring is a string, not a comment.
// ---------------------------------------------------------------------------

function stripPy(text) {
  return text
    .split('\n')
    .map((line, index) => {
      if (index === 0 && line.startsWith('#!')) return line
      const trimmed = line.trimStart()
      if (trimmed.startsWith('#')) return null
      return line
    })
    .filter((line) => line !== null)
    .join('\n')
}

// ---------------------------------------------------------------------------
// Tidy up after the removals
// ---------------------------------------------------------------------------

/**
 * A line that held only a comment is gone, not left blank; a run of blank
 * lines collapses to one; a block never opens on a blank line.
 */
function tidy(text) {
  const lines = text.split('\n').map((line) => (line.trim() === '' ? '' : line.replace(/\s+$/, '')))

  const out = []
  for (const line of lines) {
    const previous = out[out.length - 1]
    if (line === '' && previous === '') continue
    if (line === '' && previous !== undefined && /[[{(]$/.test(previous.trim())) continue
    out.push(line)
  }

  while (out.length > 0 && out[out.length - 1] === '') out.pop()
  // A blank line immediately before a closer is left over from a stripped tail.
  for (let i = out.length - 1; i > 0; i--) {
    if (out[i].trim().startsWith('}') && out[i - 1] === '') out.splice(i - 1, 1)
  }

  return out.join('\n') + '\n'
}

// ---------------------------------------------------------------------------

const DIRS = ['src', 'tests', 'tools']
const SKIP = new Set(['node_modules', 'dist', '.git'])

function filesIn(dir) {
  let out = []
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out = out.concat(filesIn(full))
    else out.push(full)
  }
  return out
}

const HANDLERS = {
  '.ts': (t) => stripTs(t),
  '.mjs': (t) => stripTs(t, ts.ScriptKind.JS),
  '.js': (t) => stripTs(t, ts.ScriptKind.JS),
  '.svelte': stripSvelte,
  '.py': stripPy,
}

let files = 0
let linesBefore = 0
let linesAfter = 0
let bytesBefore = 0
let bytesAfter = 0

for (const dir of DIRS) {
  for (const file of filesIn(join(ROOT, dir))) {
    const ext = file.slice(file.lastIndexOf('.'))
    const handler = HANDLERS[ext]
    if (!handler) continue
    // Never rewrite this script with itself.
    if (file.endsWith('strip-comments.mjs')) continue

    const before = readFileSync(file, 'utf8')
    const after = tidy(handler(before))
    if (after === before) continue

    files++
    linesBefore += before.split('\n').length
    linesAfter += after.split('\n').length
    bytesBefore += Buffer.byteLength(before)
    bytesAfter += Buffer.byteLength(after)

    if (!DRY) writeFileSync(file, after, 'utf8')
    else console.log(relative(ROOT, file))
  }
}

const kb = (n) => (n / 1024).toFixed(1)
console.log(`${DRY ? '[dry] ' : ''}${files} files`)
console.log(`lines  ${linesBefore} → ${linesAfter}  (−${linesBefore - linesAfter})`)
console.log(`bytes  ${kb(bytesBefore)} KB → ${kb(bytesAfter)} KB  (−${kb(bytesBefore - bytesAfter)} KB)`)
