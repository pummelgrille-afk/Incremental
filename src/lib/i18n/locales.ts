import { EN, type Messages } from './en'
import type { ContentMessages } from './content'
import { pseudoise } from './pseudo'

/**
 * The locales this build ships.
 *
 * PLAN.md Phase 44 asks for a pipeline "to add languages post-launch based on
 * your own audience data" — so what is built here is the *slot* a language
 * drops into, not a guess at which languages. Adding one is a file and three
 * lines; the checks in `tests/i18n.test.ts` do the rest. See
 * `docs/design/i18n.md`.
 *
 * `qa` ships in every build on purpose. It costs nothing — it is a rule applied
 * to English at lookup time, not a table — and a QA language that only exists
 * in a QA build is one nobody runs.
 */
export interface LocaleDef {
  /** BCP 47, or `qa` for the pseudolocale. Stored in the save. */
  readonly code: string
  /**
   * The language's name **in itself**. Never translated: a player who has
   * landed somewhere they cannot read finds their way back by recognising
   * their own language in the list, and "Anglais" does not help them.
   */
  readonly endonym: string
  /**
   * What `Intl` should reason with — plural rules today, number formatting if
   * this project ever grows a second one.
   */
  readonly intl: string
  /** Chrome. Anything absent falls back to English, key by key. */
  readonly messages: Partial<Messages>
  /** Overrides for text authored in `content/`. See `content.ts`. */
  readonly content: ContentMessages
  /**
   * Applied to the English source when this locale has no string of its own.
   *
   * Exists for the pseudolocale, and only for it: a generated language covers
   * every string in the game, including the ones `content/` owns, without a
   * table anybody has to maintain. A real translation leaves this unset and
   * falls back to plain English instead.
   */
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

/** Falls back rather than throwing: a save may name a language a later build dropped. */
export function resolveLocale(code: string | undefined): LocaleDef {
  return (code === undefined ? undefined : localeByCode(code)) ?? LOCALES[0]
}
