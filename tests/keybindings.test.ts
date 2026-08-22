import { describe, expect, it } from 'vitest'
import {
  actionFor,
  bindingLabel,
  conflictsWith,
  isBindable,
  isDefaultBindings,
  normaliseBindings,
  strokeToBinding,
  type Bindings,
} from '../src/lib/core/keybindings'
import { ACTIONS, DEFAULT_BINDINGS } from '../src/lib/content/keybindings'

/**
 * Rebinding, as arithmetic on strings.
 *
 * All of it lives outside the component and outside `bootstrap.ts` for the
 * usual reason: the interesting questions here — what happens when two actions
 * share a key, what a save is allowed to claim — cannot be asked of a run of
 * `event.key === 'f'` comparisons inside a rAF callback.
 */

const defaults = (): Bindings => ({ ...DEFAULT_BINDINGS })

describe('the default set', () => {
  it('binds every action', () => {
    for (const action of ACTIONS) {
      expect(DEFAULT_BINDINGS[action.id], action.id).toBeTruthy()
    }
  })

  it('has no two actions on the same key', () => {
    const seen = new Map<string, string>()
    const clashes: string[] = []

    for (const action of ACTIONS) {
      const binding = DEFAULT_BINDINGS[action.id]
      const previous = seen.get(binding)
      if (previous) clashes.push(`${previous} and ${action.id} both on ${binding}`)
      seen.set(binding, action.id)
    }

    expect(clashes).toEqual([])
  })
})

describe('matching a press to an action', () => {
  it('resolves a bound key', () => {
    expect(actionFor({ code: 'KeyF' }, defaults())).toBe('formation')
    expect(actionFor({ code: 'Space' }, defaults())).toBe('flare')
  })

  it('returns null for an unbound key', () => {
    expect(actionFor({ code: 'KeyZ' }, defaults())).toBeNull()
  })

  it('does not fire a plain binding when a modifier is held', () => {
    // Ctrl+R is the browser's reload. A game that restarted the stage on it
    // would be taking a key that is not its to take.
    expect(actionFor({ code: 'KeyR' }, defaults())).toBe('restart')
    expect(actionFor({ code: 'KeyR', ctrl: true }, defaults())).toBeNull()
  })

  it('matches on physical position, not the printed letter', () => {
    /*
     * The reason bindings are stored as `code`. On AZERTY the key that carries
     * `KeyF` still sits where a QWERTY player's F is; `event.key` there would
     * be a different letter, and the default set — F, M, T, H, R, chosen as a
     * shape under one hand — would scatter across the board.
     */
    const bindings = defaults()
    expect(actionFor({ code: 'KeyM' }, bindings)).toBe('map')
    // What `event.key` would have carried is never consulted.
    expect(actionFor({ code: 'Semicolon' }, bindings)).toBeNull()
  })

  it('resolves deterministically when two actions share a key', () => {
    const bindings = defaults()
    bindings.map = 'KeyF'

    // Authored order in ACTIONS decides, not object enumeration order.
    const first = ACTIONS.find((a) => bindings[a.id] === 'KeyF')
    expect(actionFor({ code: 'KeyF' }, bindings)).toBe(first?.id)
  })
})

describe('conflicts', () => {
  it('finds none in the default set', () => {
    for (const action of ACTIONS) {
      expect(conflictsWith(action.id, defaults()), action.id).toEqual([])
    }
  })

  it('reports both sides of a clash', () => {
    // Surfaced, not refused: doubling two panels onto one key is a choice, and
    // the thing that was impossible before was *seeing* that you had.
    const bindings = defaults()
    bindings.tree = 'KeyF'

    expect(conflictsWith('tree', bindings)).toEqual(['formation'])
    expect(conflictsWith('formation', bindings)).toEqual(['tree'])
  })
})

describe('what may be bound', () => {
  it('refuses keys that belong to the browser', () => {
    expect(isBindable({ code: 'KeyW', ctrl: true })).toBe(false)
    expect(isBindable({ code: 'KeyQ', meta: true })).toBe(false)
    expect(isBindable({ code: 'Tab' })).toBe(false)
  })

  it('refuses Escape, which is what a dialog means', () => {
    expect(isBindable({ code: 'Escape' })).toBe(false)
  })

  it('refuses a bare modifier, which is a key on the way to another one', () => {
    expect(isBindable({ code: 'ShiftLeft' })).toBe(false)
    expect(isBindable({ code: 'ControlRight' })).toBe(false)
  })

  it('allows an ordinary key', () => {
    expect(isBindable({ code: 'KeyJ' })).toBe(true)
    expect(isBindable({ code: 'Space' })).toBe(true)
    expect(isBindable({ code: 'F5' })).toBe(true)
  })
})

describe('reading a stored map', () => {
  it('fills in anything missing with the default', () => {
    const bindings = normaliseBindings({ formation: 'KeyJ' })

    expect(bindings.formation).toBe('KeyJ')
    expect(bindings.map).toBe(DEFAULT_BINDINGS.map)
  })

  it('ignores rubbish rather than trusting it', () => {
    const bindings = normaliseBindings({ map: 42, tree: '', manual: null })

    expect(bindings.map).toBe(DEFAULT_BINDINGS.map)
    expect(bindings.tree).toBe(DEFAULT_BINDINGS.tree)
    expect(bindings.manual).toBe(DEFAULT_BINDINGS.manual)
  })

  it('drops an action that no longer exists', () => {
    const bindings = normaliseBindings({ wind: 'KeyW' }) as Record<string, string>
    expect(bindings.wind).toBeUndefined()
  })

  it('repairs the menu key however the save spells it', () => {
    /*
     * `menu` is fixed. A save claiming Escape is something else would let a
     * player lock themselves out of the only screen that could put it back.
     */
    const bindings = normaliseBindings({ menu: 'KeyQ' })
    expect(bindings.menu).toBe(DEFAULT_BINDINGS.menu)
  })

  it('survives a save with no settings at all', () => {
    expect(normaliseBindings(undefined)).toEqual(DEFAULT_BINDINGS)
    expect(normaliseBindings('nonsense')).toEqual(DEFAULT_BINDINGS)
  })
})

describe('presentation', () => {
  it('writes a keycap the way a player says it', () => {
    expect(bindingLabel('KeyF')).toBe('F')
    expect(bindingLabel('Digit1')).toBe('1')
    expect(bindingLabel('Space')).toBe('Space')
    expect(bindingLabel('F2')).toBe('F2')
    expect(bindingLabel('ArrowLeft')).toBe('Left')
    expect(bindingLabel('Alt+KeyF')).toBe('Alt+F')
  })

  it('spells a stroke exactly one way', () => {
    expect(strokeToBinding({ code: 'KeyF', alt: true, ctrl: true })).toBe('Ctrl+Alt+KeyF')
  })

  it('knows whether anything has been changed', () => {
    expect(isDefaultBindings(defaults())).toBe(true)
    const changed = defaults()
    changed.manual = 'KeyJ'
    expect(isDefaultBindings(changed)).toBe(false)
  })
})
