
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

export function placeholdersIn(message: string): string[] {
  const names: string[] = []
  for (const part of parseMessage(message)) {
    if ('name' in part && !names.includes(part.name)) names.push(part.name)
  }
  return names
}
