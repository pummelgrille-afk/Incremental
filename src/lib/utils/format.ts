
export function compact(value: number): string {
  const n = Math.floor(value)
  if (n < 1000) return n.toString()
  if (n < 1_000_000) return (Math.floor(n / 10) / 100).toFixed(2) + 'K'
  return (Math.floor(n / 10_000) / 100).toFixed(2) + 'M'
}
