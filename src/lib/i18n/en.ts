import { ALMANAC } from './en/almanac'
import { COMMON } from './en/common'
import { FORMATION } from './en/formation'
import { HUD } from './en/hud'
import { MENUS } from './en/menus'
import { SETTINGS } from './en/settings'
import { TERMS } from './en/terms'

export const EN = {
  ...COMMON,
  ...TERMS,
  ...HUD,
  ...MENUS,
  ...SETTINGS,
  ...FORMATION,
  ...ALMANAC,
} as const

export type MessageKey = keyof typeof EN

export type Messages = Record<MessageKey, string>
