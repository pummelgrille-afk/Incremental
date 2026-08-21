import { formatNumber } from './format'

export interface GeneratorDef {
  id: string
  name: string
  description: string
  baseCost: number
  /** Each purchase multiplies the next cost by this. The core incremental knob. */
  costGrowth: number
  /** Resource produced per second, per owned unit, before multipliers. */
  baseOutput: number
}

export const GENERATORS: GeneratorDef[] = [
  {
    id: 'clicker',
    name: 'Auto-Clicker',
    description: 'Presses the button so you do not have to.',
    baseCost: 10,
    costGrowth: 1.15,
    baseOutput: 0.1,
  },
  {
    id: 'factory',
    name: 'Factory',
    description: 'Industrialises the whole affair.',
    baseCost: 250,
    costGrowth: 1.2,
    baseOutput: 2,
  },
  {
    id: 'reactor',
    name: 'Reactor',
    description: 'Questionable safety record, excellent throughput.',
    baseCost: 10_000,
    costGrowth: 1.25,
    baseOutput: 50,
  },
]

/**
 * All persisted game state lives here. `$state` makes it deeply reactive, so
 * the tick loop mutates plain fields and only the DOM nodes that read a changed
 * field get updated -- no component re-render, no diffing.
 */
class GameState {
  points = $state(0)
  totalEarned = $state(0)
  owned = $state<Record<string, number>>(
    Object.fromEntries(GENERATORS.map((g) => [g.id, 0])),
  )
  lastSaved = $state(Date.now())

  /** Derived values recompute lazily, only when something they read changed. */
  pointsPerSecond = $derived(
    GENERATORS.reduce((sum, g) => sum + this.owned[g.id] * g.baseOutput, 0),
  )

  costOf(def: GeneratorDef): number {
    return Math.ceil(def.baseCost * def.costGrowth ** this.owned[def.id])
  }

  canAfford(def: GeneratorDef): boolean {
    return this.points >= this.costOf(def)
  }

  buy(def: GeneratorDef): boolean {
    const cost = this.costOf(def)
    if (this.points < cost) return false
    this.points -= cost
    this.owned[def.id] += 1
    return true
  }

  gain(amount: number) {
    this.points += amount
    this.totalEarned += amount
  }

  /** Advance the simulation by `dt` seconds. Called from the fixed-step loop. */
  tick(dt: number) {
    this.gain(this.pointsPerSecond * dt)
  }

  get pointsLabel(): string {
    return formatNumber(this.points)
  }
}

export const game = new GameState()
