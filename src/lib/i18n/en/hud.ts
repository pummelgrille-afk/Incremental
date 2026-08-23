/**
 * The always-on readout, the sidebar, and the four banners.
 *
 * The banners are the reason this file has more prose than the rest: a stopped
 * field with no sentence on it reads as a freeze, which is a bug report Phase
 * 33 actually received. Each of the three states that stops the field says what
 * has happened and what happens next.
 */
export const HUD = {
  'hud.wave': '{stage} — wave {current}/{total}',
  'hud.pause': 'Pause',
  'hud.resume': 'Resume',
  'hud.flare-charge': 'Flare charge',
  'hud.strike-hint': 'Click the field or {flare} to strike',

  'hud.standby.title': 'Standing by.',
  'hud.standby.body': 'Nothing is approaching. Take as long as you need.',
  'hud.standby.next': 'The shift restarts from the first wave.',
  'hud.standby.begin': 'Begin the shift',

  'hud.paused.title': 'Paused.',
  'hud.paused.body': 'The rings are holding station.',
  'hud.paused.next': '{pause} or {escape} to go on.',

  'hud.cleared.title': 'Stage clear.',
  'hud.cleared.body': 'The rings hold. {salvage} salvage recovered.',
  'hud.cleared.award': '+{clearance} Clearance',
  'hud.cleared.award-zone': '+{clearance} Clearance — zone complete',
  'hud.cleared.next-in': 'Next stage in {seconds}…',
  'hud.cleared.end': 'End of the authored stages. {restart} to run it again.',

  'hud.lost.title': 'The Perihelion has stopped.',
  'hud.lost.body': 'Output exhausted. Nothing is lost but the shift.',
  'hud.lost.next': '{restart} to wind it again.',

  /*
   * The tabs carry the *short* form — "Almanac", not "The Almanac".
   *
   * They are not the same string as the panel's title and were never written
   * as one: a tab is a place, and the article belongs on the title bar of the
   * thing it opens. Collapsing the two onto `term.*` would have widened three
   * of the six tabs by four characters for nothing.
   */
  'sidebar.label': 'Panels',
  'sidebar.formation': 'Formation',
  'sidebar.map': 'Perihelion',
  'sidebar.tree': 'Almanac',
  'sidebar.rewind': 'Rewind',
  'sidebar.manual': 'Manual',
  'sidebar.menu': 'Menu',
  'sidebar.stand-down': 'Stand down',
  'sidebar.held': 'Held',
  'sidebar.stand-down.hint':
    'Stop the stage and hold the field. It restarts from the first wave.',
  'sidebar.held.hint': 'Already held. The stage will restart when you begin.',

  'toast.label': 'Noted',
  'tutorial.more': '{count} more',
} as const
