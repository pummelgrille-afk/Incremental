import type { MessageKey } from '../i18n/en'
import type { ContentField, ContentKind } from '../i18n/content'
import { DEFAULT_LOCALE, LOCALES, resolveLocale, type LocaleDef } from '../i18n/locales'
import {
  contentTextIn,
  messageIn,
  pluralIn,
  setLocale,
  translateIn,
  type MessageParams,
} from '../i18n/translate'

/**
 * The bridge from `i18n/` into Svelte.
 *
 * `stores/` is the only place allowed to know about both, and language is the
 * clearest case for the rule: the catalogue, the fallback chain and the plural
 * selection are all plain functions a Vitest process can call, and the only
 * thing that had to become reactive is *which locale is current*.
 *
 * One rune, therefore, and every `t()` here **passes it as an argument** rather
 * than reading it for effect. That is not style — a discarded read (`void
 * state.code`) reads like dead code to anyone maintaining it, and the day
 * somebody deletes it the game keeps working until a player changes language,
 * at which point half the screen stays in the old one. Passing the locale makes
 * the dependency the same shape as every other dependency Svelte tracks.
 *
 * Nothing is cached, and it does not need to be: a `t()` is an object lookup
 * and a string join, redrawn by the same runtime that redraws the HUD when
 * Salvage ticks.
 */
const state = $state({ code: DEFAULT_LOCALE })

export const locale = {
  get code(): string {
    return state.code
  },
  /** The active locale. Reading this is what subscribes a component. */
  get def(): LocaleDef {
    return resolveLocale(state.code)
  },
  get all(): readonly LocaleDef[] {
    return LOCALES
  },
}

/**
 * Switch language.
 *
 * Sets the module-level locale in `i18n/` *and* the rune, in that order: the
 * first is what `core/save.ts` reads when it has no component to be reactive
 * to, the second is what tells Svelte to ask again.
 */
export function useLocale(code: string): void {
  setLocale(code)
  state.code = resolveLocale(code).code
}

export function t(key: MessageKey, params?: MessageParams): string {
  return translateIn(locale.def, key, params)
}

/** The raw message, holes and all — for `T.svelte` to fill with snippets. */
export function raw(key: MessageKey): string {
  return messageIn(locale.def, key)
}

export function plural(base: string, count: number, params?: MessageParams): string {
  return pluralIn(locale.def, base, count, params)
}

export function content(
  kind: ContentKind,
  id: string,
  field: ContentField,
  english: string,
): string {
  return contentTextIn(locale.def, kind, id, field, english)
}
