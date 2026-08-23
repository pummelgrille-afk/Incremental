
export type ActionId =
  | 'menu'
  | 'pause'
  | 'flare'
  | 'formation'
  | 'map'
  | 'tree'
  | 'rewind'
  | 'manual'
  | 'restart'
  | 'diagnostics'

export interface ActionDef {
  id: ActionId

  name: string

  default: string

  group: 'Play' | 'Panels' | 'System'

  fixed?: true
}

export const ACTIONS: readonly ActionDef[] = [
  {
    id: 'flare',
    name: 'Fire the Flare',

    default: 'Space',
    group: 'Play',
  },
  { id: 'pause', name: 'Pause', default: 'KeyK', group: 'Play' },
  { id: 'formation', name: 'Formation', default: 'KeyF', group: 'Panels' },
  { id: 'map', name: 'The Perihelion', default: 'KeyM', group: 'Panels' },
  { id: 'tree', name: 'The Almanac', default: 'KeyT', group: 'Panels' },
  { id: 'rewind', name: 'Rewind', default: 'KeyP', group: 'Panels' },
  { id: 'manual', name: 'The Manual', default: 'KeyH', group: 'Panels' },
  { id: 'restart', name: 'Restart the stage', default: 'KeyR', group: 'System' },
  { id: 'diagnostics', name: 'Diagnostics', default: 'F2', group: 'System' },
  { id: 'menu', name: 'Menu / close', default: 'Escape', group: 'System', fixed: true },
] as const

export const DEFAULT_BINDINGS: Readonly<Record<ActionId, string>> = Object.freeze(
  Object.fromEntries(ACTIONS.map((a) => [a.id, a.default])) as Record<ActionId, string>,
)

export const ACTIONS_BY_ID: ReadonlyMap<ActionId, ActionDef> = new Map(
  ACTIONS.map((a) => [a.id, a]),
)
