import { ACTIONS, ACTIONS_BY_ID, DEFAULT_BINDINGS, type ActionId } from '../content/keybindings'

export interface KeyStroke {
  code: string
  ctrl?: boolean
  alt?: boolean
  meta?: boolean
}

export type Bindings = Record<ActionId, string>

export function strokeToBinding(stroke: KeyStroke): string {
  const parts: string[] = []
  if (stroke.ctrl) parts.push('Ctrl')
  if (stroke.alt) parts.push('Alt')
  if (stroke.meta) parts.push('Meta')
  parts.push(stroke.code)
  return parts.join('+')
}

export function bindingLabel(binding: string): string {
  const parts = binding.split('+')
  const code = parts[parts.length - 1]
  const modifiers = parts.slice(0, -1)

  let label = code
  if (code.startsWith('Key')) label = code.slice(3)
  else if (code.startsWith('Digit')) label = code.slice(5)
  else if (code === 'Space') label = 'Space'

  else if (code === 'Escape') label = 'Esc'
  else if (code.startsWith('Arrow')) label = code.slice(5)

  return [...modifiers, label].join('+')
}

export function actionFor(stroke: KeyStroke, bindings: Bindings): ActionId | null {
  const pressed = strokeToBinding(stroke)
  for (const action of ACTIONS) {
    if (bindings[action.id] === pressed) return action.id
  }
  return null
}

export function conflictsWith(id: ActionId, bindings: Bindings): ActionId[] {
  const binding = bindings[id]
  if (!binding) return []
  return ACTIONS.filter((a) => a.id !== id && bindings[a.id] === binding).map((a) => a.id)
}

export function isBindable(stroke: KeyStroke): boolean {
  if (stroke.ctrl || stroke.meta) return false
  if (stroke.code === 'Escape' || stroke.code === 'Tab') return false

  return !/^(Shift|Control|Alt|Meta)(Left|Right)$/.test(stroke.code)
}

export function normaliseBindings(raw: unknown): Bindings {
  const source = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const out = {} as Bindings

  for (const action of ACTIONS) {
    const value = source[action.id]

    out[action.id] =
      action.fixed || typeof value !== 'string' || value.length === 0
        ? DEFAULT_BINDINGS[action.id]
        : value
  }

  return out
}

export function isDefaultBindings(bindings: Bindings): boolean {
  return ACTIONS.every((a) => bindings[a.id] === DEFAULT_BINDINGS[a.id])
}

export { ACTIONS, ACTIONS_BY_ID, DEFAULT_BINDINGS }
export type { ActionId }
