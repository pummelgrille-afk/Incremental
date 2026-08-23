import { ALMANAC } from './en/almanac'
import { COMMON } from './en/common'
import { FORMATION } from './en/formation'
import { HUD } from './en/hud'
import { MENUS } from './en/menus'
import { SETTINGS } from './en/settings'
import { TERMS } from './en/terms'

/**
 * English, the source language.
 *
 * **This object defines the key set.** `MessageKey` is `keyof typeof EN`, so a
 * `t()` call for a key nobody has written does not compile, and a translation
 * file with a key English has dropped does not either. Every other locale is a
 * `Partial<Messages>` and falls back here per key rather than per file — a
 * half-finished translation ships as a half-translated game rather than as a
 * broken one.
 *
 * Split by surface under `en/`, and composed here. The split is the same rule
 * the rest of the project follows: one file, one job. The composition is a
 * spread of `as const` objects, which keeps every value a literal type — the
 * placeholder checks in `tests/i18n.test.ts` read them.
 *
 * See `docs/design/i18n.md` for how a language is added.
 */
export const EN = {
  ...COMMON,
  ...TERMS,
  ...HUD,
  ...MENUS,
  ...SETTINGS,
  ...FORMATION,
  ...ALMANAC,
} as const

/** Every message key in the game. */
export type MessageKey = keyof typeof EN

/** A complete catalogue. Translations are `Partial<Messages>`. */
export type Messages = Record<MessageKey, string>
