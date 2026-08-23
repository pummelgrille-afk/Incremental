import { EN, type MessageKey } from './en'
import { parseMessage } from './parts'
import { contentKey, type ContentField, type ContentKind } from './content'
import { resolveLocale, type LocaleDef } from './locales'

/**
 * The translator: a key and some values in, a sentence out.
 *
 * Deliberately small. It does three things — look a key up, fall back to
 * English, and fill the holes — and everything it does not do is a decision:
 *
 * - **No date or currency formatting.** This game has no dates on screen and
 *   one number format, `utils/format.ts`, which every locale shares.
 * - **No gender or select forms.** Nothing here is written about a person.
 * - **Plurals only where a count is actually in the sentence**, through
 *   `pluralIn()` below, which asks `Intl.PluralRules` rather than testing
 *   `=== 1`. English has two forms and would have let us get away with the
 *   test; a language with six would not, and the fix would have been in forty
 *   files by then.
 *
 * ## Two ways in, and the difference matters
 *
 * Every function here comes in a pair: one that **takes a locale** and one that
 * reads the module-level `active`.
 *
 * The `…In(locale, …)` form is the real one. `stores/i18n.svelte.ts` passes the
 * locale it holds in a rune, which is what makes a language change redraw the
 * screen — the locale is an *argument*, so Svelte sees the dependency the same
 * way it sees any other.
 *
 * The bare form is for callers with no reactive context: `core/save.ts` builds
 * an `Error` message, and there is no component for it to be reactive to. It
 * is never the right one to call from a component, and `tests/i18n.test.ts`
 * refuses one that does.
 *
 * Nothing in here touches Svelte, which is what lets every rule above be tested
 * in a plain Vitest process.
 */

export type MessageParams = Readonly<Record<string, string | number>>

/** Where the bare forms read from. Set through `stores/i18n.svelte.ts`. */
let active: LocaleDef = resolveLocale(undefined)

export function setLocale(code: string): void {
  active = resolveLocale(code)
}

export function activeLocale(): LocaleDef {
  return active
}

/** The raw message, before interpolation. English fills a missing key. */
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

/**
 * Text authored in `content/`, translated if this locale has an override.
 *
 * `english` is the def's own field, and it is the fallback — so a locale that
 * has translated the chrome and none of the units is a playable game in that
 * language with English unit names, rather than a screen full of ids.
 */
export function contentTextIn(
  locale: LocaleDef,
  kind: ContentKind,
  id: string,
  field: ContentField,
  english: string,
): string {
  return locale.content[contentKey(kind, id, field)] ?? locale.transform?.(english) ?? english
}

/**
 * A plural form, chosen by the locale's own rules.
 *
 * `base` is a key stem: `pluralIn(l, 'duration.minutes', 1)` reads
 * `duration.minutes.one`, and falls back to `.other` for any category this
 * catalogue has not authored. Authoring `one` and `other` is enough for
 * English; a language that needs `few` gets it by adding the key, with no
 * change here and none at the call site.
 */
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

// --- The bare forms. For callers with nothing to be reactive to. ------------

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
