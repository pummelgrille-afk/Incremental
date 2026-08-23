
export type Deficiency = 'deuteranopia' | 'protanopia' | 'tritanopia'

function toLinear(c: number): number {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

function toSrgb(c: number): number {
  const clamped = Math.max(0, Math.min(1, c))
  const s = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055
  return Math.round(s * 255)
}

export function unpack(hex: number): [number, number, number] {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff]
}

const RGB_TO_LMS = [
  [0.31399022, 0.63951294, 0.04649755],
  [0.15537241, 0.75789446, 0.08670142],
  [0.01775239, 0.10944209, 0.87256922],
]

const LMS_TO_RGB = [
  [5.47221206, -4.6419601, 0.16963708],
  [-1.1252419, 2.29317094, -0.1678952],
  [0.02980165, -0.19318073, 1.16364789],
]

const COLLAPSE: Record<Deficiency, number[][]> = {
  protanopia: [
    [0, 1.05118294, -0.05116099],
    [0, 1, 0],
    [0, 0, 1],
  ],
  deuteranopia: [
    [1, 0, 0],
    [0.9513092, 0, 0.04866992],
    [0, 0, 1],
  ],
  tritanopia: [
    [1, 0, 0],
    [0, 1, 0],
    [-0.86744736, 1.86727089, 0],
  ],
}

function apply(m: number[][], v: number[]): number[] {
  return m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2])
}

export function simulate(hex: number, deficiency: Deficiency): number {
  const [r, g, b] = unpack(hex).map(toLinear)
  const lms = apply(RGB_TO_LMS, [r, g, b])
  const collapsed = apply(COLLAPSE[deficiency], lms)
  const [nr, ng, nb] = apply(LMS_TO_RGB, collapsed).map(toSrgb)
  return (nr << 16) | (ng << 8) | nb
}

export function distance(a: number, b: number): number {
  const [r1, g1, b1] = unpack(a)
  const [r2, g2, b2] = unpack(b)
  const rMean = (r1 + r2) / 2
  const dr = r1 - r2
  const dg = g1 - g2
  const db = b1 - b2
  return Math.sqrt(
    (((512 + rMean) * dr * dr) >> 8) + 4 * dg * dg + (((767 - rMean) * db * db) >> 8),
  )
}

export function luminance(hex: number): number {
  const [r, g, b] = unpack(hex).map(toLinear)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
