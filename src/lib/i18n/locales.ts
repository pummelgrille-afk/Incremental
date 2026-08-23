import { EN, type Messages } from './en'
import type { ContentMessages } from './content'
import { pseudoise } from './pseudo'

export interface LocaleDef {
  readonly code: string

  readonly endonym: string

  readonly intl: string

  readonly messages: Partial<Messages>

  readonly content: ContentMessages

  readonly transform?: (english: string) => string
}

export const LOCALES: readonly LocaleDef[] = [
  { code: 'en', endonym: 'English', intl: 'en', messages: EN, content: {} },
  {
    code: 'qa',
    endonym: '⟦Ƥŝéüðø⟧',
    intl: 'en',
    messages: {},
    content: {},
    transform: pseudoise,
  },
]

export const DEFAULT_LOCALE = 'en'

export function localeByCode(code: string): LocaleDef | undefined {
  return LOCALES.find((locale) => locale.code === code)
}

export function resolveLocale(code: string | undefined): LocaleDef {
  return (code === undefined ? undefined : localeByCode(code)) ?? LOCALES[0]
}
