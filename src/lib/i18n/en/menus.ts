
export const MENUS = {
  'menu.sub': 'paused',
  'menu.label': 'Menu',
  'menu.shift': 'Shift',
  'menu.back-to-field': 'Back to the field',
  'menu.note':
    'The field is stopped while this is open. {pause} pauses without it; ' +
    '{manual} opens the Manual; {restart} restarts the stage. Nothing is lost ' +
    'but the shift.',

  'map.label': 'Stage select',
  'map.sub': '{cleared} of {total} zones cleared',
  'map.zone-progress': '{cleared}/{total}',
  'map.encounter': 'Encounter',
  'map.cleared': 'cleared',
  'map.sealed': 'Requires the previous zone.',
  'map.attribution': '— {source}',

  'rewind.voice':
    'Wind it back to the first shift. You keep what you have learned; the ' +
    'floor does not.',
  'rewind.after': '{before} → {after}',
  'rewind.kept': 'Kept',
  'rewind.kept.clearance': '{count} Clearance',
  'rewind.kept.units': '{count} unlocked units, with their levels',
  'rewind.kept.nodes': '{count} Almanac nodes',
  'rewind.kept.zones.one': '{count} zone unlocked',
  'rewind.kept.zones.other': '{count} zones unlocked',
  'rewind.kept.rest': 'Achievements, settings, statistics',
  'rewind.kept.note': 'You never re-clear a zone to reach it again.',
  'rewind.reset': 'Reset',
  'rewind.reset.salvage': '{count} Salvage',
  'rewind.reset.units': '{platforms} slotted Platforms, {arrays} mounted Arrays',
  'rewind.reset.stage': 'Stage progress this run',
  'rewind.reset.repairs': 'Repairs and reinforcements',
  'rewind.reset.note': 'The opening formation is handed back.',
  'rewind.no-award':
    'This run reached stage {depth}, which grants no Recollection. Reach ' +
    'stage {threshold} and a Rewind starts paying.',
  'rewind.locked': 'The Rewind opens after the first boss is cleared.',
  'rewind.not-yet': 'Not yet',
  'rewind.confirm': 'Yes — wind it back',
  'rewind.commit': 'Rewind for {award}',

  'offline.title': 'The orbits kept turning',
  'offline.label': 'While you were away',
  'offline.voice': '{duration} away. Somebody covered the watch, after a fashion.',
  'offline.counted': 'Counted',
  'offline.over-cap': 'Past the {duration} limit',
  'offline.over-cap.value': '{duration} earned nothing',
  'offline.shortfall': 'Had you been here',
  'offline.shortfall.value': 'about {amount} more',
  'offline.note':
    'Nothing else accrues while you are away: no conjunctions fire, no stages ' +
    'clear, and so {emphasis}. The station runs without you — just not as well.',
  'offline.note.emphasis': 'no Clearance is earned',

  'duration.seconds': '{count} seconds',
  'duration.minutes.one': '{count} minute',
  'duration.minutes.other': '{count} minutes',
  'duration.hours': '{count} hours',
} as const
