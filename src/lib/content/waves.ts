import type { SpawnGroup, WaveDef } from '../entities/Wave'

export function scattered(defId: string, count: number, interval = 0.5): WaveDef {
  return {
    groups: [{ defId, count, delay: 0, interval }],
    gapAfter: 4,
  }
}

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

export function guarded(
  bulkId: string,
  bulkCount: number,
  guardId: string,
  guardCount = 1,
  centre = 0,
): WaveDef {
  const arc = { centre, width: Math.PI / 5 }
  return {
    groups: [
      { defId: bulkId, count: bulkCount, delay: 0, interval: 0.35, arc },

      { defId: guardId, count: guardCount, delay: 0, interval: 1, arc },
    ],
    gapAfter: 5,
  }
}

export function custom(groups: SpawnGroup[], gapAfter = 4): WaveDef {
  return { groups, gapAfter }
}

export function withGap(wave: WaveDef, gapAfter: number): WaveDef {
  return { ...wave, gapAfter }
}
