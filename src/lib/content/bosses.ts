import type { BossDef } from '../entities/Boss'

export const BOSSES: readonly BossDef[] = [
  {
    id: 'the-backlog',
    name: 'The Backlog',
    description:
      'Every contact anyone ever waved through, keeping its appointment ' +
      'together.',
    armour: 'massed',
    maxHp: 90,
    attack: 10,
    defence: 6,
    speed: 12,
    hurtboxRadius: 26,
    baseDrop: 120,
    phaseTelegraphMs: 900,
    firstClearSalvage: 400,
    phases: [
      { name: 'Arriving', fromHpFraction: 1, patternId: 'spread-3', patternInterval: 2.6 },
      {
        name: 'All At Once',
        fromHpFraction: 0.6,
        patternId: 'ring-8',
        patternInterval: 3,

        summons: { defId: 'skiff', count: 4, everySeconds: 7 },
      },
      {
        name: 'Cleared',
        fromHpFraction: 0.25,
        patternId: 'wall-9',
        patternInterval: 2.8,
        summons: { defId: 'mote', count: 6, everySeconds: 6 },
      },
    ],
  },
  {
    id: 'the-sympathetic',
    name: 'The Sympathetic',
    description:
      'It is not attacking in rhythm. You are defending in its rhythm. Notice ' +
      'the difference.',
    armour: 'erratic',
    maxHp: 105,
    attack: 11,
    defence: 8,
    speed: 16,
    hurtboxRadius: 24,
    baseDrop: 150,
    phaseTelegraphMs: 850,
    firstClearSalvage: 500,
    phases: [
      { name: 'In Step', fromHpFraction: 1, patternId: 'spiral-4', patternInterval: 2.4 },
      { name: 'Doubling', fromHpFraction: 0.65, patternId: 'spiral-3', patternInterval: 1.9 },
      {
        name: 'Self-Sustaining',
        fromHpFraction: 0.3,
        patternId: 'spiral-4',
        patternInterval: 1.5,
        summons: { defId: 'picket', count: 2, everySeconds: 10 },
      },
    ],
  },
  {
    id: 'long-wear',
    name: 'Long Wear',
    description: 'Slow. Patient. It has already won against everything else here.',
    armour: 'seized',

    maxHp: 130,
    attack: 8,
    defence: 14,
    speed: 8,
    hurtboxRadius: 30,
    baseDrop: 180,
    phaseTelegraphMs: 1000,
    firstClearSalvage: 650,
    phases: [
      { name: 'Erosion', fromHpFraction: 1, patternId: 'converge-7', patternInterval: 5 },
      { name: 'Two Centuries', fromHpFraction: 0.6, patternId: 'ring-6', patternInterval: 3.4 },
      {
        name: 'Compressed',
        fromHpFraction: 0.25,
        patternId: 'ring-8',
        patternInterval: 2.6,
        summons: { defId: 'tender', count: 3, everySeconds: 9 },
      },
    ],
  },
  {
    id: 'the-blank-page',
    name: 'The Blank Page',
    description: 'No entry. Proceed at the Undermaster’s discretion.',
    armour: 'rigid',
    maxHp: 155,
    attack: 13,
    defence: 12,
    speed: 14,
    hurtboxRadius: 26,
    baseDrop: 220,
    phaseTelegraphMs: 800,
    firstClearSalvage: 850,
    phases: [
      { name: 'Unlisted', fromHpFraction: 1, patternId: 'aimed-1', patternInterval: 1.8 },
      {
        name: 'Undocumented',
        fromHpFraction: 0.7,
        patternId: 'wall-5',
        patternInterval: 2.2,
        summons: { defId: 'harrier', count: 2, everySeconds: 11 },
      },
      {
        name: 'Bound In Regardless',
        fromHpFraction: 0.35,
        patternId: 'spiral-3',
        patternInterval: 1.7,
        summons: { defId: 'shell', count: 2, everySeconds: 12 },
      },
    ],
  },
  {
    id: 'the-dark-watch',
    name: 'The Dark Watch',
    description:
      'It is not holding the station. It is the reason the station is unlit.',
    armour: 'seized',

    maxHp: 185,
    attack: 15,
    defence: 16,
    speed: 11,
    hurtboxRadius: 30,
    baseDrop: 300,
    phaseTelegraphMs: 950,
    firstClearSalvage: 1200,
    phases: [
      { name: 'The Hour', fromHpFraction: 1, patternId: 'wall-9', patternInterval: 3.2 },
      {
        name: 'Still Happening',
        fromHpFraction: 0.7,
        patternId: 'converge-7',
        patternInterval: 3.6,
        summons: { defId: 'warden', count: 1, everySeconds: 14 },
      },
      {
        name: 'Unlit',
        fromHpFraction: 0.3,
        patternId: 'ring-8',
        patternInterval: 2.2,
        summons: { defId: 'brood', count: 2, everySeconds: 10 },
      },
    ],
  },
] as const

const BY_ID = new Map(BOSSES.map((b) => [b.id, b]))

export function bossById(id: string): BossDef | undefined {
  return BY_ID.get(id)
}
