/**
 * FNV-1a, 32-bit.
 *
 * Used as a checksum on exported save strings so a truncated or hand-edited
 * paste is rejected with a clear message rather than loaded as a corrupt save.
 *
 * Not cryptographic and not meant to be. A determined player can edit their own
 * save, and that is their business — this catches accidents, not cheating.
 */

const FNV_OFFSET_BASIS = 0x811c9dc5
const FNV_PRIME = 0x01000193

export function fnv1a(text: string): number {
  let hash = FNV_OFFSET_BASIS

  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    // Multiply by the FNV prime in 32-bit space. Math.imul keeps it exact;
    // plain `*` would lose precision once the value exceeds 2^53.
    hash = Math.imul(hash, FNV_PRIME)
  }

  // Coerce to unsigned so the hex form is stable.
  return hash >>> 0
}

/** Fixed-width lowercase hex, for embedding in an export string. */
export function checksum(text: string): string {
  return fnv1a(text).toString(16).padStart(8, '0')
}
