/**
 * Every keyboard action in the game, and what it is bound to out of the box.
 *
 * The bindings lived inside `core/bootstrap.ts` as a run of `event.key === 'f'`
 * comparisons from Phase 10 until Phase 43. That worked and could not be
 * rebound, could not be listed, and could not be told whether two actions had
 * ended up on the same key.
 *
 * Content, not logic: this file says *what the actions are* and what they open
 * at. `core/keybindings.ts` decides which action an event is, and nothing here
 * knows a `KeyboardEvent` exists.
 */

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
  /** As it appears in the settings list and in the HUD's hint line. */
  name: string
  /** The default binding, as `core/keybindings.ts` normalises a key. */
  default: string
  /**
   * Grouping for the settings list. Ordering within a group is authored order.
   */
  group: 'Play' | 'Panels' | 'System'
  /**
   * Refused as a rebind target, and hidden from the list.
   *
   * Only `menu`. A player who binds every action to the same key must still
   * have a way back to the screen that lets them fix it, and Escape closing
   * things is not a preference — it is what a dialog means.
   */
  fixed?: true
}

export const ACTIONS: readonly ActionDef[] = [
  {
    id: 'flare',
    name: 'Fire the Flare',
    // Space, because it is the one live input in the game and the one key a
    // player already has a hand on. The pointer keeps aiming; this strikes the
    // deepest Contact, which is a worse shot and always available.
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

/** Lookup by id, for the settings list and for validation. */
export const ACTIONS_BY_ID: ReadonlyMap<ActionId, ActionDef> = new Map(
  ACTIONS.map((a) => [a.id, a]),
)
