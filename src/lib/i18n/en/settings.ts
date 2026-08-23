/**
 * Settings, and the save-handling copy that lives on it.
 *
 * The hints are the longest strings in the game and the most load-bearing: each
 * one is the only explanation of a control the player has no other way to
 * understand. They are also the strings a translator will expand the furthest,
 * which is why `Field` wraps its hint and nothing here is budgeted to a line.
 */
export const SETTINGS = {
  'settings.sound': 'Sound',
  'settings.master': 'Master',
  'settings.master.hint': 'Everything, together.',
  'settings.music': 'Music',
  'settings.music.hint': "The bed. It follows the field's intensity.",
  'settings.effects': 'Effects',
  'settings.effects.hint': 'Hits, the Flare, and the acknowledgements.',
  'settings.master.label': 'Master volume',
  'settings.music.label': 'Music volume',
  'settings.effects.label': 'Effects volume',

  'settings.legibility': 'Legibility',
  'settings.palette': 'Colour palette',
  'settings.palette.hint':
    'The default palette puts four of the colours you have to tell apart on ' +
    'the red–green axis. These do not.',
  'settings.text-size': 'Text size',
  'settings.text-size.hint': 'Scales every panel and the HUD.',
  'settings.text-size.small': 'Small',
  'settings.text-size.normal': 'Normal',
  'settings.text-size.large': 'Large',
  'settings.text-size.largest': 'Largest',
  'settings.shake': 'Screen shake',
  'settings.shake.hint':
    'A short kick when the Sun takes damage. Nothing else in the game shakes.',
  'settings.reduced-motion': 'Reduced motion',
  'settings.reduced-motion.hint':
    'Turns off sparks, the screen shake and the animated counters. The field ' +
    'itself keeps moving — that is the game.',
  'settings.reduced-motion.forced': 'on — your system asks for it',
  'settings.diagnostics': 'Diagnostics',
  'settings.diagnostics.hint': 'Frame times, entity counts and budgets.',

  // The language picker names itself in each language, never in the current
  // one: a player who has landed in a language they cannot read has to be able
  // to find their way out by recognising their own.
  'settings.language': 'Language',
  'settings.language.hint':
    'Every language is named in itself, so this row is readable from any of ' +
    'them.',

  'settings.keys': 'Keys',
  'settings.keys.aside':
    'Bindings follow the physical key, not the letter printed on it — so the ' +
    'defaults keep their shape under your hand on any layout. Escape is ' +
    'fixed: it closes whatever is open, and there has to be a way back to ' +
    'this screen.',
  'settings.keys.rebinding': 'press a key…',
  'settings.keys.clash': 'also {actions}',
  'settings.keys.reset': 'Back to defaults',
  'settings.keys.group.play': 'Play',
  'settings.keys.group.panels': 'Panels',
  'settings.keys.group.system': 'System',

  'settings.save': 'Your save',
  'settings.save.aside':
    'Everything is kept in this browser, on this machine. Clearing site data ' +
    'clears the game — a copy is the only backup there is.',
  'settings.save.export': 'Copy out',
  'settings.save.import': 'Bring one in',
  'settings.save.exported': 'Select all and copy. This is the whole save.',
  'settings.save.paste': 'Paste a save here. This replaces everything and reloads.',
  'settings.save.placeholder': 'perihelion…',
  'settings.save.replace': 'Replace my save',

  // Thrown by `core/save.ts`, which carries the key rather than the sentence.
  'save.error.unavailable': 'Unavailable',
  'save.error.empty': 'Nothing to import.',
  'save.error.not-a-save': 'That does not look like a Perihelion save string.',
  'save.error.bad-version': 'Save string has an unreadable version tag.',
  'save.error.too-new':
    'That save is from a newer version of the game (schema {version}). ' +
    'Update before importing it.',
  'save.error.damaged':
    'Save string is damaged or incomplete — check that the whole string was copied.',
  'save.error.undecodable': 'Save string could not be decoded.',
  'save.error.not-save-data': 'Save string does not contain valid save data.',
  'save.error.unmigratable': 'Save could not be migrated.',
  'save.error.unmigratable.detail': 'That save could not be migrated: {problem}',
  'save.error.rejected': 'Save string failed validation: {problems}',
} as const
