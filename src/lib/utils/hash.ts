
const FNV_OFFSET_BASIS = 0x811c9dc5
const FNV_PRIME = 0x01000193

export function fnv1a(text: string): number {
  let hash = FNV_OFFSET_BASIS

  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)

    hash = Math.imul(hash, FNV_PRIME)
  }

  return hash >>> 0
}

export function checksum(text: string): string {
  return fnv1a(text).toString(16).padStart(8, '0')
}
