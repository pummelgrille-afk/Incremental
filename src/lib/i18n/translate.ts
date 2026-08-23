import { EN, type MessageKey } from './en'
import { parseMessage } from './parts'
import { contentKey, type ContentField, type ContentKind } from './content'
import { resolveLocale, type LocaleDef } from './locales'

export type MessageParams = Readonly<Record<string, string | number>>

let active: LocaleDef = resolveLocale(undefined)

export function setLocale(code: string): void {
  active = resolveLocale(code)
}

export function activeLocale(): LocaleDef {
  return active
}

export function messageIn(locale: LocaleDef, key: MessageKey): string {
  return locale.messages[key] ?? locale.transform?.(EN[key]) ?? EN[key]
}

export function fill(message: string, params?: MessageParams): string {
  if (params === undefined) return message

  let out = ''
  for (const part of parseMessage(message)) {
    out += 'name' in part ? String(params[part.name] ?? `{${part.name}}`) : part.text
  }
  return out
}

export function translateIn(
  locale: LocaleDef,
  key: MessageKey,
  params?: MessageParams,
): string {
  return fill(messageIn(locale, key), params)
}

export function contentTextIn(
  locale: LocaleDef,
  kind: ContentKind,
  id: string,
  field: ContentField,
  english: string,
): string {
  return locale.content[contentKey(kind, id, field)] ?? locale.transform?.(english) ?? english
}

export function pluralIn(
  locale: LocaleDef,
  base: string,
  count: number,
  params?: MessageParams,
): string {
  const category = new Intl.PluralRules(locale.intl).select(count)
  const key = (`${base}.${category}` in EN ? `${base}.${category}` : `${base}.other`) as MessageKey
  return translateIn(locale, key, { count, ...params })
}

export function messageFor(key: MessageKey): string {
  return messageIn(active, key)
}

export function translate(key: MessageKey, params?: MessageParams): string {
  return translateIn(active, key, params)
}

export function contentText(
  kind: ContentKind,
  id: string,
  field: ContentField,
  english: string,
): string {
  return contentTextIn(active, kind, id, field, english)
}

export function plural(base: string, count: number, params?: MessageParams): string {
  return pluralIn(active, base, count, params)
}
