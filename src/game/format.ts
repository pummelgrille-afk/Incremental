const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc']

/**
 * Compact display for resource counts: 1234 -> "1.23K", 5.2e18 -> "5.20Qi".
 * Falls back to exponential past the named suffixes.
 */
export function formatNumber(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return '∞'
  if (value < 0) return '-' + formatNumber(-value, decimals)
  if (value < 1000) return value < 10 && value % 1 !== 0 ? value.toFixed(decimals) : Math.floor(value).toString()

  const tier = Math.floor(Math.log10(value) / 3)
  if (tier >= SUFFIXES.length) return value.toExponential(decimals)

  return (value / 1000 ** tier).toFixed(decimals) + SUFFIXES[tier]
}

/** Per-second rates, shown with a sign so gains and drains read differently. */
export function formatRate(value: number): string {
  return `${value >= 0 ? '+' : ''}${formatNumber(value)}/s`
}

/** Elapsed seconds -> "2h 5m", for offline-progress summaries. */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}
