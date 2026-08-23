
export const FORMATION = {
  'formation.hint': '{close} to close · drag a unit onto a slot',
  'formation.slot': 'Ring {ring}, slot {slot}',
  'formation.slot.occupied': 'Ring {ring}, slot {slot} — {unit}',
  'formation.mount': 'Rim mount {mount}',
  'formation.mount.occupied': 'Rim mount {mount} — {unit}',
  'formation.costs':
    'Next Platform slot {slot} · next Array mount {mount} Salvage. Moving a ' +
    'unit is free; taking one off refunds in full.',

  'formation.refusal.occupied': 'That slot is taken.',
  'formation.refusal.not-unlocked': 'Not unlocked yet — buy it with Clearance first.',
  'formation.refusal.unaffordable': 'Not enough to pay for that.',
  'formation.refusal.invalid-slot': 'No such slot.',
  'formation.refusal.preset-limit': 'No preset slots left. Delete one first.',
  'formation.refusal.partial': 'Some of that preset could not be fielded.',

  'formation.conjunction': 'Next conjunction',
  'formation.conjunction.none': 'none scheduled',
  'formation.conjunction.needs': 'Needs two Platforms on {different} rings.',
  'formation.conjunction.needs.emphasis': 'different',
  'formation.conjunction.seconds': '{seconds}s',
  'pairing.matched': 'One damage type throughout. Conjunction effects are amplified.',
  'pairing.interference': 'Opposed types aligned. Effects are weaker but reach further.',
  'pairing.mixed': 'No amplification either way. Conjunction effects are unmodified.',

  'formation.roster': 'Roster',
  'formation.kind.array': 'array',
  'formation.field-cost':
    'Fielding this costs {cost} Salvage — the price of your next {slot}. ' +
    'Moving a fielded unit is free.',
  'formation.field-cost.mount': 'rim mount',
  'formation.field-cost.slot': 'ring slot',
  'formation.level-up': 'Level up for {cost} Clearance',
  'formation.unlock': 'Unlock for {cost} Clearance',
  'formation.unlock.price': '{cost} Clearance',
  'formation.plus': '+{cost}',

  'formation.arrays': 'Arrays',
  'formation.array.stats': '{charge} charge · {interval}s',
  'formation.array.locked': 'locked',
  'formation.track.price': '{cost} Clearance',
  'track.capacity': 'Capacity',
  'track.capacity.effect': 'holds another shot',
  'track.recharge': 'Recharge',
  'track.recharge.effect': 'recharges faster',
  'track.resonance': 'Resonance',
  'track.resonance.effect': 'strikes harder',

  'formation.presets': 'Presets',
  'formation.preset.name': 'Name this arrangement',
  'formation.preset.field': 'Field',
  'formation.preset.empty': 'Saved arrangements survive a Rewind.',

  'card.platform': 'Platform · ring slot',
  'card.array': 'Array · rim mount',
  'card.attack': 'Attack',
  'card.interval': 'Every',
  'card.integrity': 'Integrity',
  'card.defence': 'Defence',
  'card.seconds': '{seconds}s',
  'card.targeting': 'It {behaviour}.',
  'card.conjunction': 'In a conjunction it contributes {effect}.',
  'card.no-conjunction': 'Arrays never join a conjunction.',
  'card.locked':
    'Locked. {cost} Clearance to add it to the roster; the stats above are ' +
    'what it opens at.',
} as const
