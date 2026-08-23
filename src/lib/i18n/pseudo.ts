import { parseMessage } from './parts'

/**
 * The pseudolocale: English, accented and stretched.
 *
 * PLAN.md Phase 44 asks for QA of "text overflow/wrapping across languages",
 * and this project has no other language to QA against — the pipeline exists so
 * that one can be added from audience data after launch, which is exactly when
 * it is too late to discover that the sidebar was cut to fit "Formation".
 *
 * So the QA language is generated. It is **a rule, not a table**, in the same
 * sense as the starfield and the score: `LOCALES` gives it a `transform`
 * instead of messages, so it covers every string in the game — including the
 * 140 content names and descriptions that live in `content/` rather than in the
 * catalogue — and it cannot fall out of step with any of them.
 *
 * It does three jobs at once:
 *
 * 1. **It expands.** Short strings grow the most, which is the shape real
 *    translation takes: a six-letter button label routinely doubles, while a
 *    long paragraph settles around a third longer. Tiers in `expansionFor`.
 * 2. **It stays readable.** Latin letters with diacritics, not Cyrillic or
 *    boxes — a tester has to be able to tell that the right string is in the
 *    right place, and to spot a sentence assembled out of two.
 * 3. **It is delimited.** Every message is wrapped in `⟦…⟧`, so a clipped
 *    string shows as a *missing bracket* rather than as a judgement call about
 *    whether that sentence was meant to end there. A string with no brackets
 *    at all was never localised.
 *
 * Placeholders pass through untouched. A pseudolocale that mangled `{count}`
 * would be testing the interpolator rather than the layout.
 */

/** Latin-1 lookalikes. Same width class, obviously not English. */
const ACCENTS: Record<string, string> = {
  a: 'á', b: 'ƀ', c: 'ç', d: 'ð', e: 'é', f: 'ƒ', g: 'ĝ', h: 'ĥ', i: 'î',
  j: 'ĵ', k: 'ĸ', l: 'ĺ', m: 'ɱ', n: 'ñ', o: 'ø', p: 'þ', q: 'ǫ', r: 'ŕ',
  s: 'ŝ', t: 'ţ', u: 'ü', v: 'ṽ', w: 'ŵ', x: 'ẋ', y: 'ý', z: 'ž',
  A: 'Á', B: 'Ɓ', C: 'Ç', D: 'Ð', E: 'É', F: 'Ƒ', G: 'Ĝ', H: 'Ĥ', I: 'Î',
  J: 'Ĵ', K: 'Ķ', L: 'Ĺ', M: 'Ϻ', N: 'Ñ', O: 'Ø', P: 'Þ', Q: 'Ǫ', R: 'Ŕ',
  S: 'Ŝ', T: 'Ţ', U: 'Ü', V: 'Ṽ', W: 'Ŵ', X: 'Ẋ', Y: 'Ý', Z: 'Ž',
}

/** Opening and closing marks. A missing `⟧` is a clipped string. */
export const PSEUDO_OPEN = '⟦'
export const PSEUDO_CLOSE = '⟧'

/**
 * How much longer a translation of this length should be assumed to run.
 *
 * Shorter strings expand further, because a label carries no redundancy to
 * spend: "Save" has one word to work with, a paragraph has forty.
 */
export function expansionFor(length: number): number {
  if (length <= 10) return 1.0
  if (length <= 20) return 0.8
  if (length <= 30) return 0.6
  if (length <= 50) return 0.4
  return 0.3
}

/** Padding, drawn from a cycle rather than one repeated glyph. */
const FILLER = 'áéîøü'

function pad(count: number): string {
  let out = ''
  for (let i = 0; i < count; i++) out += FILLER[i % FILLER.length]
  return out
}

/** One message, accented and stretched. Placeholders survive intact. */
export function pseudoise(message: string): string {
  let body = ''
  /*
   * Only the literal runs count toward the length being expanded. A message
   * that is mostly `{placeholder}` has little text in it to translate, and
   * padding against the substituted value would overstate the growth.
   */
  let literal = 0

  for (const part of parseMessage(message)) {
    if ('name' in part) {
      body += `{${part.name}}`
      continue
    }
    literal += part.text.length
    body += part.text.replace(/[a-zA-Z]/g, (c) => ACCENTS[c] ?? c)
  }

  const extra = Math.ceil(literal * expansionFor(literal))
  return `${PSEUDO_OPEN}${body}${extra > 0 ? ' ' + pad(extra - 1) : ''}${PSEUDO_CLOSE}`
}
