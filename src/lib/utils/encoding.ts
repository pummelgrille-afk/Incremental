/**
 * UTF-8-safe base64.
 *
 * `btoa` operates on binary strings and throws on any code point above 0xFF,
 * so text must be encoded to UTF-8 bytes first. Save data is currently ASCII,
 * but content ids are authored text and a single em dash would break exports
 * silently — hence doing it properly now rather than after a bug report.
 *
 * Uses only `btoa`/`atob` and `TextEncoder`/`TextDecoder`, all of which are
 * global in every target browser and in Node 16+. No `Buffer`, so this compiles
 * against the browser lib and still runs under Vitest.
 */

/** String.fromCharCode(...bytes) overflows the stack on large inputs. */
const CHUNK_SIZE = 0x8000

export function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)

  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE))
  }

  return btoa(binary)
}

export function decodeBase64(encoded: string): string {
  const binary = atob(encoded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new TextDecoder().decode(bytes)
}
