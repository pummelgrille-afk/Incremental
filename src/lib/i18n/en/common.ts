/**
 * Words that belong to no one screen.
 *
 * A key lands here only when three or more surfaces say the same thing; two is
 * a coincidence. The alternative — every screen owning its own "Back to it" —
 * is the drift Phase 42 spent a whole pass undoing in CSS, and a translator
 * given the same sentence four times will eventually translate it four ways.
 */
export const COMMON = {
  'common.back-to-it': 'Back to it',
  'common.locked': 'Locked',
  'common.max': 'max',
  'common.level': 'lv {level}',
  'common.dismiss': 'Understood',
  'common.delete': 'Delete {name}',
  'common.save': 'Save',

  /*
   * The one screen that is not a screen: what `App.svelte` puts up when the
   * session refuses to start. Translated like everything else, because the
   * player reading it is having the worst possible first minute and telling
   * them so in a language they did not choose does not improve it.
   */
  'app.failed': 'The Perihelion did not start.',
} as const
