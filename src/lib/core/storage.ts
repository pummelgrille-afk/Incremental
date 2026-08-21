/**
 * Storage backend abstraction.
 *
 * Two reasons this exists rather than calling localStorage directly:
 *
 *   1. ADR-002 records a migration path to IndexedDB if saves ever outgrow
 *      localStorage. Callers must not know which backend is in use.
 *   2. localStorage does not exist in a plain Node process, and the save layer
 *      has to be testable without a DOM (docs/architecture.md).
 *
 * Deliberately synchronous. An async interface would push promise handling into
 * the tick loop's autosave path for no benefit at this data size. If IndexedDB
 * ever becomes necessary it will be wrapped behind a write-behind cache rather
 * than making this async.
 */

export interface StorageBackend {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** Thrown when a write fails because the origin is out of quota. */
export class StorageQuotaError extends Error {
  constructor(key: string, bytes: number) {
    super(`Storage quota exceeded writing "${key}" (${bytes} bytes)`)
    this.name = 'StorageQuotaError'
  }
}

/** In-memory backend. Used in tests, and as a fallback in private browsing. */
export class MemoryStorage implements StorageBackend {
  private readonly map = new Map<string, string>()

  getItem(key: string): string | null {
    return this.map.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value)
  }

  removeItem(key: string): void {
    this.map.delete(key)
  }

  /** Test helper. Not part of StorageBackend. */
  clear(): void {
    this.map.clear()
  }
}

/**
 * Wraps `window.localStorage`, translating quota failures into a typed error so
 * callers can distinguish "disk full" from "storage unavailable".
 */
class LocalStorageBackend implements StorageBackend {
  constructor(private readonly store: Storage) {}

  getItem(key: string): string | null {
    try {
      return this.store.getItem(key)
    } catch {
      // Safari throws on read in some privacy configurations.
      return null
    }
  }

  setItem(key: string, value: string): void {
    try {
      this.store.setItem(key, value)
    } catch (error) {
      if (isQuotaError(error)) throw new StorageQuotaError(key, value.length)
      throw error
    }
  }

  removeItem(key: string): void {
    try {
      this.store.removeItem(key)
    } catch {
      // Nothing to clean up if storage is unavailable.
    }
  }
}

function isQuotaError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return (
    error.name === 'QuotaExceededError' ||
    // Firefox's legacy name.
    error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    // Safari private browsing reports quota 0 this way.
    error.name === 'QUOTA_EXCEEDED_ERR'
  )
}

/**
 * True when localStorage is present *and* writable. Presence alone is not
 * enough — Safari in private browsing exposes the API and throws on write.
 */
export function isLocalStorageAvailable(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false
    const probe = '__perihelion_probe__'
    localStorage.setItem(probe, '1')
    localStorage.removeItem(probe)
    return true
  } catch {
    return false
  }
}

/**
 * The backend the game should use. Falls back to memory so that a player in
 * private browsing gets a working (if non-persistent) session rather than a
 * crash — the export string in save.ts is their route to keeping progress.
 */
export function defaultStorage(): StorageBackend {
  return isLocalStorageAvailable()
    ? new LocalStorageBackend(localStorage)
    : new MemoryStorage()
}
