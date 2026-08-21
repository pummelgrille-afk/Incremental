import type { SpawnGroup, WaveDef } from '../entities/Wave'

/**
 * Reusable wave shapes.
 *
 * PLAN.md Phase 15 asks for wave configuration as data. Stages in `zones.ts`
 * compose these rather than spelling out spawn groups inline, so a wave shape
 * can be retuned in one place and every stage using it follows.
 *
 * A wave is **a question posed to the formation**. Each builder below states
 * which question it asks, because a wave that does not ask anything is just
 * time passing.
 *
 * Arrival intervals were tightened in Phase 17 after a playtest reported the
 * field feeling empty. Density was measured against the fixed starting
 * formation: +50% counts with faster arrival still clears every stage, while
 * +100% loses two of three. See docs/phases/phase-17.md.
 */

/**
 * Full circle, unguessable bearings.
 *
 * A group with no `arc` gets a fresh uniform bearing per spawn (`spawn.ts`), so
 * this shape asks for raw coverage and offers nothing to memorise. It was named
 * `evenly` before spawn bearings were randomised, which had stopped being true.
 *
 * This is the zone's default shape. Arc-based waves — `massed`, `pincer` — keep
 * a recognisable silhouette by design, and a Phase 17 playtest found that
 * silhouette read as *scripted* rather than as a question being posed.
 */
export function scattered(defId: string, count: number, interval = 0.5): WaveDef {
  return {
    groups: [{ defId, count, delay: 0, interval }],
    gapAfter: 4,
  }
}

/**
 * Concentrated on one arc.
 *
 * Asks whether the formation is evenly spread or clumped — and rewards a Flare,
 * since a cluster is exactly what an area strike is for.
 */
export function massed(
  defId: string,
  count: number,
  centre = 0,
  width = Math.PI / 3,
): WaveDef {
  return {
    groups: [{ defId, count, delay: 0, interval: 0.32, arc: { centre, width } }],
    gapAfter: 4,
  }
}

/**
 * Two opposed arcs at once.
 *
 * Asks whether the formation can cover both sides simultaneously. A build that
 * concentrates everything on one arc fails this even if its total damage is
 * higher — which is the point.
 */
export function pincer(defId: string, countPerSide: number): WaveDef {
  return {
    groups: [
      {
        defId,
        count: countPerSide,
        delay: 0,
        interval: 0.4,
        arc: { centre: 0, width: Math.PI / 4 },
      },
      {
        defId,
        count: countPerSide,
        delay: 0,
        interval: 0.4,
        arc: { centre: Math.PI, width: Math.PI / 4 },
      },
    ],
    gapAfter: 5,
  }
}

/**
 * A bulk group with something dangerous arriving behind it.
 *
 * Asks whether the formation can hold its shape while a priority target walks
 * in — the case `highestThreat` targeting exists for.
 */
export function escorted(
  bulkId: string,
  bulkCount: number,
  eliteId: string,
  eliteCount = 1,
  eliteDelay = 5,
): WaveDef {
  return {
    groups: [
      { defId: bulkId, count: bulkCount, delay: 0, interval: 0.4 },
      { defId: eliteId, count: eliteCount, delay: eliteDelay, interval: 1.2 },
    ],
    gapAfter: 5,
  }
}

/** Compose arbitrary groups when no shape above fits. */
export function custom(groups: SpawnGroup[], gapAfter = 4): WaveDef {
  return { groups, gapAfter }
}

/** Override the recovery window on any wave. */
export function withGap(wave: WaveDef, gapAfter: number): WaveDef {
  return { ...wave, gapAfter }
}
