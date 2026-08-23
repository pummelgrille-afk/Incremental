
export interface StorageBackend {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export class StorageQuotaError extends Error {
  constructor(key: string, bytes: number) {
    super(`Storage quota exceeded writing "${key}" (${bytes} bytes)`)
    this.name = 'StorageQuotaError'
  }
}

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

  clear(): void {
    this.map.clear()
  }
}

class LocalStorageBackend implements StorageBackend {
  constructor(private readonly store: Storage) {}

  getItem(key: string): string | null {
    try {
      return this.store.getItem(key)
    } catch {
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
    }
  }
}

function isQuotaError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return (
    error.name === 'QuotaExceededError' ||

    error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||

    error.name === 'QUOTA_EXCEEDED_ERR'
  )
}

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

export function defaultStorage(): StorageBackend {
  return isLocalStorageAvailable()
    ? new LocalStorageBackend(localStorage)
    : new MemoryStorage()
}
