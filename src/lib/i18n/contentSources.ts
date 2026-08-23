import { ACHIEVEMENTS } from '../content/achievements'
import { ARRAYS } from '../content/arrays'
import { ACTIONS } from '../content/keybindings'
import { PALETTE_NAMES } from '../content/palettes'
import { PLATFORMS } from '../content/platforms'
import { TUTORIAL_STEPS } from '../content/tutorial'
import { UPGRADE_NODES } from '../content/upgrades'
import { ZONES } from '../content/zones'
import { contentKey, type ContentKey } from './content'

/**
 * Every string authored in `content/` that reaches the screen, with its key.
 *
 * Two things read this and nothing else does:
 *
 * - `tools/i18n-extract.mjs`, which writes a translator's stub from it.
 * - `tests/i18n.test.ts`, which checks that no locale overrides a key naming
 *   content that has since been renamed — the failure mode a keys-derived-from-
 *   ids scheme actually has, and one that is otherwise silent.
 *
 * **What is not here is the interesting part.** Ten Contacts and thirteen boss
 * and boss-phase names are authored in `content/` and are drawn by nothing:
 * there is no bestiary, the field draws sprites, and a boss stage's title on the
 * map is the *stage's* name, not the boss's. Extracting them would hand a
 * translator two dozen strings that can never appear, and paying for that twice
 * — once in money, once in the reviewer's time — for text nobody can see is
 * worse than leaving them English. They join the list the day something draws
 * them.
 */
export interface ContentSource {
  readonly key: ContentKey
  readonly english: string
}

export function contentSources(): ContentSource[] {
  const out: ContentSource[] = []
  const push = (key: ContentKey, english: string) => out.push({ key, english })

  for (const def of PLATFORMS) {
    push(contentKey('platform', def.id, 'name'), def.name)
    push(contentKey('platform', def.id, 'description'), def.description)
  }

  for (const def of ARRAYS) {
    push(contentKey('array', def.id, 'name'), def.name)
    push(contentKey('array', def.id, 'description'), def.description)
  }

  for (const zone of ZONES) {
    push(contentKey('zone', zone.id, 'name'), zone.name)
    // An epigraph is a quotation and its source; both are text on the map.
    push(contentKey('epigraph', zone.id, 'description'), zone.epigraph)
    push(contentKey('epigraph', zone.id, 'name'), zone.epigraphAttribution)
    for (const stage of zone.stages) {
      push(contentKey('stage', `${zone.id}:${stage.id}`, 'name'), stage.name)
    }
  }

  for (const node of UPGRADE_NODES) {
    push(contentKey('upgrade', node.id, 'name'), node.name)
    push(contentKey('upgrade', node.id, 'description'), node.description)
  }

  for (const def of ACHIEVEMENTS) {
    push(contentKey('achievement', def.id, 'name'), def.name)
    push(contentKey('achievement', def.id, 'description'), def.description)
  }

  for (const step of TUTORIAL_STEPS) {
    push(contentKey('tutorial', step.id, 'name'), step.name)
    push(contentKey('tutorial', step.id, 'description'), step.description)
  }

  // The settings list shows every action, `menu` included: it is unbindable,
  // not invisible.
  for (const action of ACTIONS) {
    push(contentKey('action', action.id, 'name'), action.name)
  }

  for (const [id, name] of Object.entries(PALETTE_NAMES)) {
    push(contentKey('palette', id, 'name'), name)
  }

  return out
}
