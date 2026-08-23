import { parseMessage } from './parts'

const ACCENTS: Record<string, string> = {
  a: 'á', b: 'ƀ', c: 'ç', d: 'ð', e: 'é', f: 'ƒ', g: 'ĝ', h: 'ĥ', i: 'î',
  j: 'ĵ', k: 'ĸ', l: 'ĺ', m: 'ɱ', n: 'ñ', o: 'ø', p: 'þ', q: 'ǫ', r: 'ŕ',
  s: 'ŝ', t: 'ţ', u: 'ü', v: 'ṽ', w: 'ŵ', x: 'ẋ', y: 'ý', z: 'ž',
  A: 'Á', B: 'Ɓ', C: 'Ç', D: 'Ð', E: 'É', F: 'Ƒ', G: 'Ĝ', H: 'Ĥ', I: 'Î',
  J: 'Ĵ', K: 'Ķ', L: 'Ĺ', M: 'Ϻ', N: 'Ñ', O: 'Ø', P: 'Þ', Q: 'Ǫ', R: 'Ŕ',
  S: 'Ŝ', T: 'Ţ', U: 'Ü', V: 'Ṽ', W: 'Ŵ', X: 'Ẋ', Y: 'Ý', Z: 'Ž',
}

export const PSEUDO_OPEN = '⟦'
export const PSEUDO_CLOSE = '⟧'

export function expansionFor(length: number): number {
  if (length <= 10) return 1.0
  if (length <= 20) return 0.8
  if (length <= 30) return 0.6
  if (length <= 50) return 0.4
  return 0.3
}

const FILLER = 'áéîøü'

function pad(count: number): string {
  let out = ''
  for (let i = 0; i < count; i++) out += FILLER[i % FILLER.length]
  return out
}

export function pseudoise(message: string): string {
  let body = ''

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
