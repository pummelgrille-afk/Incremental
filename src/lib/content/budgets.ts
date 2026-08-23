
export const BUDGETS = {
  contact: 200,

  projectiles: 600,

  particles: 400,

  units: 56,
} as const

export const FRAME_BUDGET_MS = 1000 / 60

export const FRAME_SAFETY_FACTOR = 0.6

export const TARGET_FRAME_MS = FRAME_BUDGET_MS * FRAME_SAFETY_FACTOR
