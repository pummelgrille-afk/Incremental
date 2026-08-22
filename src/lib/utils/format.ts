/**
 * Number formatting for anything a player reads.
 *
 * One function, in one place, because the game had two: the HUD abbreviated
 * Salvage past a thousand and the Formation and Almanac headers printed the
 * same balance in full. A player moving between them saw `1.70K` become `1702`
 * and had to work out that those were the same number.
 */

/**
 * Abbreviate for a readout that has to hold still.
 *
 * Three significant figures past a thousand: enough to see the number move,
 * few enough that the column does not resize while it does. Truncated rather
 * than rounded — a balance that displays 1.71K and refuses a purchase costing
 * 1706 is a bug report.
 */
export function compact(value: number): string {
  const n = Math.floor(value)
  if (n < 1000) return n.toString()
  if (n < 1_000_000) return (Math.floor(n / 10) / 100).toFixed(2) + 'K'
  return (Math.floor(n / 10_000) / 100).toFixed(2) + 'M'
}
