/**
 * The Almanac: the tree canvas, its detail panel, and the hover card.
 *
 * `almanac.effect.*` are assembled from a sign, a number and a term rather than
 * authored per effect — twelve effect kinds times three shapes would be
 * thirty-six strings that all say the same thing, and the term itself is
 * already in `terms.ts` because the roster card wants it too.
 */
export const ALMANAC = {
  'almanac.hint': '{close} to close · drag to pan · scroll to zoom',
  'almanac.recentre': 'Recentre',
  'almanac.respec': 'Respec ({refund})',
  'almanac.respec.running': 'Only between runs',
  'almanac.respec.hint': 'Refunds everything, free',
  'almanac.tier': '{branch} · tier {tier}',
  'almanac.purchased': 'Purchased.',
  'almanac.cost': '{cost} Recollection',
  'almanac.path': '{count} nodes · {total} Recollection',
  'almanac.path.note.one': 'Requires {count} earlier node. Highlighted on the tree.',
  'almanac.path.note.other': 'Requires {count} earlier nodes. Highlighted on the tree.',
  'almanac.buy': 'Buy for {cost}',
  'almanac.empty':
    'Four branches, wound outward from the centre. Select a node to see what ' +
    'it costs and what it needs first.',

  // Sign, magnitude, term. `ANGLE` and `FLAT` effects read as counts; the rest
  // read as percentages, and a repair-cost node is the only one that subtracts.
  'almanac.effect.percent': '{sign}{value}% {term}',
  'almanac.effect.flat': '+{value} {term}',
  'almanac.effect.angle': '+{value}° {term}',
} as const
