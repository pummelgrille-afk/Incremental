
export const SCALING = {
  enemyHpGrowth: 1.14,
  enemyDamageGrowth: 1.09,

  enemyCountStageDivisor: 3,

  bossInterval: 8,
  bossHpMultiplier: 12,
  bossDamageMultiplier: 1.5,
} as const

export const OVER_LEVEL = {
  threshold: 3,

  countPerPressure: 0.35,

  maxCountBonus: 0.5,
} as const
