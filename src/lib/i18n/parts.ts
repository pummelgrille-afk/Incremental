/**
 * A message, split into the literal runs and the holes between them.
 *
 * Every localised string in this project goes through here, because both
 * consumers need the same split and must not disagree about it:
 *
 * - `translate()` fills the holes with plain values and joins.
 * - `ui/T.svelte` fills them with *snippets*, so a sentence can carry a keycap
 *   or a bold run without the translator being handed markup to preserve.
 *
 * A placeholder is `{name}`. There is no escape for a literal brace, and
 * `tests/i18n.test.ts` refuses a message that contains an unmatched one — an
 * escape nobody needs is a rule every translator has to be told about.
 */

/** A literal run of text, or the name of a hole to fill. */
export type MessagePart = { readonly text: string } | { readonly name: string }

const PLACEHOLDER = /\{(\w+)\}/g

export function parseMessage(message: string): MessagePart[] {
  const parts: MessagePart[] = []
  let last = 0

  for (const match of message.matchAll(PLACEHOLDER)) {
    const at = match.index
    if (at > last) parts.push({ text: message.slice(last, at) })
    parts.push({ name: match[1] })
    last = at + match[0].length
  }

  if (last < message.length) parts.push({ text: message.slice(last) })
  return parts
}

/** The placeholder names a message expects, in order of first appearance. */
export function placeholdersIn(message: string): string[] {
  const names: string[] = []
  for (const part of parseMessage(message)) {
    if ('name' in part && !names.includes(part.name)) names.push(part.name)
  }
  return names
}
