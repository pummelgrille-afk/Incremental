import { ACHIEVEMENTS } from '../content/achievements'
import { ARRAYS } from '../content/arrays'
import { ACTIONS } from '../content/keybindings'
import { PALETTE_NAMES } from '../content/palettes'
import { PLATFORMS } from '../content/platforms'
import { TUTORIAL_STEPS } from '../content/tutorial'
import { UPGRADE_NODES } from '../content/upgrades'
import { ZONES } from '../content/zones'
import { contentKey, type ContentKey } from './content'

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

  for (const action of ACTIONS) {
    push(contentKey('action', action.id, 'name'), action.name)
  }

  for (const [id, name] of Object.entries(PALETTE_NAMES)) {
    push(contentKey('palette', id, 'name'), name)
  }

  return out
}
