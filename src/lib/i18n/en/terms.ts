/**
 * The game's own vocabulary, and the enumerations the UI spells out.
 *
 * Two rules run through this file.
 *
 * **A currency is named once.** "Salvage" appears on six surfaces; it is one
 * key, so a translator picks the word once and the game cannot end up calling
 * it two things.
 *
 * **An enum member is not a label.** `role: 'tank'` is a simulation value that
 * three components were each turning into English by hand — one as "Tank", one
 * as a sentence, one by printing the raw member. Every union in
 * `entities/types.ts` that reaches the screen has its labels here, and the
 * component looks them up.
 */
export const TERMS = {
  // Currencies and the nouns on the HUD.
  'term.output': 'Output',
  'term.salvage': 'Salvage',
  'term.clearance': 'Clearance',
  'term.recollection': 'Recollection',
  'term.flare': 'The Flare',
  'term.sun': 'Sun',

  // Panels, by the name on their own title bar.
  'term.perihelion': 'The Perihelion',
  'term.formation': 'Formation',
  'term.almanac': 'The Almanac',
  'term.manual': 'The Manual',
  'term.menu': 'Menu',
  'term.rewind': 'Rewind',
  'term.settings': 'Settings',

  // What a unit is for. The short label and the sentence the card carries.
  'role.tank': 'Tank',
  'role.damage': 'Damage',
  'role.support': 'Support',
  'role.control': 'Control',
  'role.tank.copy': 'Tank — soaks hits and blocks the widest arc.',
  'role.damage.copy': 'Damage — its whole case is the number it puts out.',
  'role.support.copy': 'Support — improves what the rest of the formation does.',
  'role.control.copy': 'Control — slows, disables and buys the line time.',

  // How it picks what to shoot. Written to complete "It …".
  'targeting.nearest': 'shoots whatever is closest',
  'targeting.lowestHp': 'finishes the most wounded',
  'targeting.highestThreat': 'answers the biggest threat',
  'targeting.deepest': 'takes whatever is furthest in',
  'targeting.none': 'never attacks',

  // What it puts into a conjunction. Written to complete "it contributes …".
  'conjunction.damagePulse': 'a damage pulse across the field',
  'conjunction.shield': 'a shield on itself',
  'conjunction.haste': 'attack speed on itself',
  'conjunction.repair': 'repairs on every participant',

  'damage-type.shear': 'shear',
  'damage-type.percussive': 'percussive',
  'damage-type.thermal': 'thermal',
  'damage-type.resonant': 'resonant',

  'branch.aperture': 'Aperture',
  'branch.shielding': 'Shielding',
  'branch.recovery': 'Recovery',
  'branch.regulation': 'Regulation',

  // What an Almanac node moves. Written lowercase: they read inside a phrase.
  'effect.attack': 'attack',
  'effect.haste': 'attack speed',
  'effect.conjunctionPotency': 'conjunction potency',
  'effect.output': 'Output',
  'effect.defence': 'defence',
  'effect.blockArc': 'block arc',
  'effect.salvage': 'Salvage',
  'effect.recollection': 'Recollection',
  'effect.repairCost': 'repair cost',
  'effect.flareCharges': 'Flare charges',
  'effect.flareRadius': 'blast radius',
  'effect.conjunctionTolerance': 'conjunction window',
} as const
