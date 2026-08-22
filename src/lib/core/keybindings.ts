import { ACTIONS, ACTIONS_BY_ID, DEFAULT_BINDINGS, type ActionId } from '../content/keybindings'

/**
 * Which action a key press is, and what a binding may be.
 *
 * Framework-free and DOM-free on purpose. It takes a `KeyStroke` — the four
 * fields of a keyboard event that matter — rather than a `KeyboardEvent`, so
 * every rule in here is testable in a plain Node process. `bootstrap.ts` does
 * the one-line conversion at the edge.
 */

/** The parts of a key press a binding is allowed to look at. */
export interface KeyStroke {
  /**
   * The physical key: `KeyF`, `Space`, `Escape`, `F2`, `Digit1`.
   *
   * **`code`, not `key`.** A binding is a position on the keyboard, not the
   * letter printed on it: on an AZERTY or Dvorak layout `event.key` for the
   * same physical key is a different letter, and a game whose defaults are
   * F/M/T/H would scatter them across the board. `code` is also unaffected by
   * Shift, so `KeyF` does not become `F` and stop matching.
   */
  code: string
  ctrl?: boolean
  alt?: boolean
  meta?: boolean
}

export type Bindings = Record<ActionId, string>

/**
 * Serialise a stroke to the string a binding is stored as.
 *
 * Modifiers in a fixed order so `Ctrl+Alt+KeyF` has exactly one spelling. Shift
 * is deliberately not a modifier here: it is part of no default, and treating
 * it as one would mean a player who rebinds to a key and later holds Shift
 * finds the action silently gone.
 */
export function strokeToBinding(stroke: KeyStroke): string {
  const parts: string[] = []
  if (stroke.ctrl) parts.push('Ctrl')
  if (stroke.alt) parts.push('Alt')
  if (stroke.meta) parts.push('Meta')
  parts.push(stroke.code)
  return parts.join('+')
}

/** How a binding is written on a keycap. `KeyF` → `F`, `Digit1` → `1`. */
export function bindingLabel(binding: string): string {
  const parts = binding.split('+')
  const code = parts[parts.length - 1]
  const modifiers = parts.slice(0, -1)

  let label = code
  if (code.startsWith('Key')) label = code.slice(3)
  else if (code.startsWith('Digit')) label = code.slice(5)
  else if (code === 'Space') label = 'Space'
  else if (code.startsWith('Arrow')) label = code.slice(5)

  return [...modifiers, label].join('+')
}

/**
 * The action this stroke triggers, or `null`.
 *
 * Linear over ten actions, which is cheaper than building a reverse map on
 * every keystroke and impossible to leave stale. If two actions somehow share a
 * binding, the one earlier in `ACTIONS` wins — deterministic rather than
 * whichever the object happened to enumerate first.
 */
export function actionFor(stroke: KeyStroke, bindings: Bindings): ActionId | null {
  const pressed = strokeToBinding(stroke)
  for (const action of ACTIONS) {
    if (bindings[action.id] === pressed) return action.id
  }
  return null
}

/**
 * Actions currently sharing a binding with `id`.
 *
 * The settings list shows these rather than refusing the rebind. A player who
 * deliberately doubles up two panels on one key is not making a mistake the
 * game needs to prevent; a player who does it by accident needs to be able to
 * see it, which is the part that was impossible before.
 */
export function conflictsWith(id: ActionId, bindings: Bindings): ActionId[] {
  const binding = bindings[id]
  if (!binding) return []
  return ACTIONS.filter((a) => a.id !== id && bindings[a.id] === binding).map((a) => a.id)
}

/**
 * A stroke that may not be bound to anything.
 *
 * Deliberately short. Everything on it would take a key away from the browser
 * rather than from the game, and a game that eats Ctrl+W has made a decision
 * that is not its to make.
 */
export function isBindable(stroke: KeyStroke): boolean {
  if (stroke.ctrl || stroke.meta) return false
  if (stroke.code === 'Escape' || stroke.code === 'Tab') return false
  // A bare modifier press is what happens *while* reaching for a combination,
  // never the combination itself.
  return !/^(Shift|Control|Alt|Meta)(Left|Right)$/.test(stroke.code)
}

/**
 * Repair a stored binding map.
 *
 * Anything missing or not a string falls back to the default, and an action
 * that no longer exists is dropped. A save is untrusted input — `saveSchema.ts`
 * treats it that way everywhere else, and a keybinding map is the one piece of
 * settings a player can put arbitrary strings into by hand.
 */
export function normaliseBindings(raw: unknown): Bindings {
  const source = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const out = {} as Bindings

  for (const action of ACTIONS) {
    const value = source[action.id]
    // `menu` is fixed: a save claiming Escape is something else is repaired,
    // not honoured, or a player can lock themselves out of the settings screen
    // that would let them fix it.
    out[action.id] =
      action.fixed || typeof value !== 'string' || value.length === 0
        ? DEFAULT_BINDINGS[action.id]
        : value
  }

  return out
}

/** True when every action still sits on its default. */
export function isDefaultBindings(bindings: Bindings): boolean {
  return ACTIONS.every((a) => bindings[a.id] === DEFAULT_BINDINGS[a.id])
}

export { ACTIONS, ACTIONS_BY_ID, DEFAULT_BINDINGS }
export type { ActionId }
