
export const SALVAGE = {
  zoneScaling: 0.35,

  slot: { base: 50, growth: 1.18 },

  mount: { base: 120, growth: 1.22 },

  repair: { base: 40, growth: 1.5 },

  reinforce: { base: 200, growth: 1.25, bonus: 0.2 },
} as const

export const RECOLLECTION = {
  depthExponent: 1.6,
  depthDivisor: 8,
} as const

export const CLEARANCE = {
  normalStageFirstClear: 1,
  bossStageFirstClear: 5,
  zoneComplete: 10,

  reclear: 0,
} as const

export const TREE = {
  nodeCostGrowth: 1.9,
} as const

export const ROSTER = {
  levelCost: { base: 1, growth: 1.55 },

  maxLevel: 10,

  levelScaling: 0.12,
} as const

export const SUPPORT = {
  trackCost: { base: 2, growth: 1.7 },

  capacity: {
    maxLevel: 3,

    chargesPerLevel: 1,
  },

  recharge: {
    maxLevel: 2,
    secondsPerLevel: 0.5,

    floorSeconds: 4.5,
  },

  resonance: {
    maxLevel: 3,

    attackPerLevel: 0.15,
  },
} as const

export const OFFLINE = {
  capSeconds: 4 * 3600,

  maxCapSeconds: 24 * 3600,

  efficiency: 0.4,
  maxEfficiency: 0.75,

  diminishingHalflifeSeconds: 4 * 3600,
} as const
