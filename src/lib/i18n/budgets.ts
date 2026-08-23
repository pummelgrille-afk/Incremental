import type { MessageKey } from './en'
import type { ContentKey } from './content'

export const BUDGETS: Partial<Record<MessageKey | ContentKey, number>> = {
  'sidebar.formation': 22,
  'sidebar.map': 22,
  'sidebar.tree': 22,
  'sidebar.rewind': 22,
  'sidebar.manual': 22,
  'sidebar.menu': 22,
  'sidebar.stand-down': 22,
  'sidebar.held': 22,

  'settings.text-size.small': 28,
  'settings.text-size.normal': 28,
  'settings.text-size.large': 28,
  'settings.text-size.largest': 28,
  'palette.none.name': 28,
  'palette.deuteranopia.name': 28,
  'palette.protanopia.name': 28,
  'palette.tritanopia.name': 28,

  'hud.pause': 18,
  'hud.resume': 18,

  'common.max': 16,
  'formation.kind.array': 16,
  'formation.array.locked': 16,

  'map.encounter': 20,
}
