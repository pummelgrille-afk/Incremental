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

const state = $state({ code: DEFAULT_LOCALE })

export const locale = {
  get code(): string {
    return state.code
  },

  get def(): LocaleDef {
    return resolveLocale(state.code)
  },
  get all(): readonly LocaleDef[] {
    return LOCALES
  },
}

export function useLocale(code: string): void {
  setLocale(code)
  state.code = resolveLocale(code).code
}

export function t(key: MessageKey, params?: MessageParams): string {
  return translateIn(locale.def, key, params)
}

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
