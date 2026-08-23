import { checksum } from '../utils/hash'
import { decodeBase64, encodeBase64 } from '../utils/encoding'
import { migrate, MigrationError, type RawSave } from './saveMigrations'
import type { MessageKey } from '../i18n/en'
import { translate, type MessageParams } from '../i18n/translate'
import {
  createDefaultSave,
  SCHEMA_VERSION,
  validateSave,
  type SaveData,
} from './saveSchema'
import { defaultStorage, StorageQuotaError, type StorageBackend } from './storage'

const LIVE_KEY = 'perihelion:save'
const BACKUP_KEY = 'perihelion:save:backup'
const TEMP_KEY = 'perihelion:save:temp'

const LEGACY_LIVE_KEY = 'orrery:save'
const LEGACY_BACKUP_KEY = 'orrery:save:backup'

const EXPORT_PREFIX = 'ORRERY'

export type LoadSource = 'live' | 'backup' | 'legacy' | 'fresh'

export interface LoadResult {
  data: SaveData

  source: LoadSource

  offlineSeconds: number

  notices: string[]
}

export class SaveImportError extends Error {
  constructor(
    readonly key: MessageKey,
    readonly params?: MessageParams,
  ) {
    super(translate(key, params))
    this.name = 'SaveImportError'
  }
}

export class SaveManager {
  private lastWriteFailed = false

  constructor(private readonly storage: StorageBackend = defaultStorage()) {}

  load(now = Date.now()): LoadResult {
    const notices: string[] = []

    for (const [key, source] of [
      [LIVE_KEY, 'live'],
      [BACKUP_KEY, 'backup'],

      [LEGACY_LIVE_KEY, 'legacy'],
      [LEGACY_BACKUP_KEY, 'legacy'],
    ] as const) {
      const raw = this.storage.getItem(key)
      if (raw === null) continue

      const result = this.parseAndValidate(raw, now, notices)
      if (result) {
        if (source === 'backup') {
          notices.push('Primary save was unreadable; recovered from the backup.')
        }
        if (source === 'legacy') {
          notices.push('Carried your save over from before the system was renamed.')
        }
        return {
          data: result,
          source,
          offlineSeconds: Math.max(0, (now - result.savedAt) / 1000),
          notices,
        }
      }

      notices.push(`Save at "${key}" could not be read.`)
    }

    return {
      data: createDefaultSave(now),
      source: 'fresh',
      offlineSeconds: 0,
      notices,
    }
  }

  private parseAndValidate(
    raw: string,
    now: number,
    notices: string[],
  ): SaveData | null {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return null
    }

    if (typeof parsed !== 'object' || parsed === null) return null

    let candidate = parsed as RawSave
    try {
      const { save, applied } = migrate(candidate)
      candidate = save
      if (applied.length > 0) {
        notices.push(`Migrated save through schema ${applied.join(' → ')} → ${SCHEMA_VERSION}.`)
      }
    } catch (error) {
      if (error instanceof MigrationError) {
        notices.push(error.message)
        return null
      }
      throw error
    }

    const validation = validateSave(candidate, now)
    if (!validation.ok || !validation.data) {
      notices.push(...validation.problems)
      return null
    }
    notices.push(...validation.problems)

    return validation.data
  }

  save(data: SaveData, now = Date.now()): boolean {
    const payload: SaveData = { ...data, schemaVersion: SCHEMA_VERSION, savedAt: now }

    let serialized: string
    try {
      serialized = JSON.stringify(payload)
    } catch {
      return false
    }

    try {
      this.storage.setItem(TEMP_KEY, serialized)

      const readBack = this.storage.getItem(TEMP_KEY)
      if (readBack !== serialized) {
        this.storage.removeItem(TEMP_KEY)
        this.lastWriteFailed = true
        return false
      }

      const currentLive = this.storage.getItem(LIVE_KEY)
      if (currentLive !== null) {
        this.storage.setItem(BACKUP_KEY, currentLive)
      }

      this.storage.setItem(LIVE_KEY, serialized)
      this.storage.removeItem(TEMP_KEY)

      this.lastWriteFailed = false
      return true
    } catch (error) {
      this.storage.removeItem(TEMP_KEY)
      this.lastWriteFailed = true

      if (error instanceof StorageQuotaError) return false
      return false
    }
  }

  get writeFailing(): boolean {
    return this.lastWriteFailed
  }

  exportString(data: SaveData): string {
    const json = JSON.stringify({ ...data, schemaVersion: SCHEMA_VERSION })
    const encoded = encodeBase64(json)
    return `${EXPORT_PREFIX}-${SCHEMA_VERSION}-${checksum(encoded)}-${encoded}`
  }

  importString(text: string, now = Date.now()): SaveData {
    const trimmed = text.trim()
    if (trimmed.length === 0) throw new SaveImportError('save.error.empty')

    const parts = trimmed.split('-')
    if (parts.length < 4 || parts[0] !== EXPORT_PREFIX) {
      throw new SaveImportError('save.error.not-a-save')
    }

    const version = Number(parts[1])
    if (!Number.isInteger(version) || version < 1) {
      throw new SaveImportError('save.error.bad-version')
    }
    if (version > SCHEMA_VERSION) {
      throw new SaveImportError('save.error.too-new', { version })
    }

    const expected = parts[2]

    const encoded = parts.slice(3).join('-')

    if (checksum(encoded) !== expected) {
      throw new SaveImportError('save.error.damaged')
    }

    let json: string
    try {
      json = decodeBase64(encoded)
    } catch {
      throw new SaveImportError('save.error.undecodable')
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(json)
    } catch {
      throw new SaveImportError('save.error.not-save-data')
    }

    let candidate: RawSave
    try {
      candidate = migrate(parsed as RawSave).save
    } catch (error) {
      throw error instanceof MigrationError
        ? new SaveImportError('save.error.unmigratable.detail', { problem: error.message })
        : new SaveImportError('save.error.unmigratable')
    }

    const validation = validateSave(candidate, now)
    if (!validation.ok || !validation.data) {
      throw new SaveImportError('save.error.rejected', {
        problems: validation.problems.join('; '),
      })
    }

    return validation.data
  }

  clear(): void {
    this.storage.removeItem(LIVE_KEY)
    this.storage.removeItem(BACKUP_KEY)
    this.storage.removeItem(TEMP_KEY)
    this.storage.removeItem(LEGACY_LIVE_KEY)
    this.storage.removeItem(LEGACY_BACKUP_KEY)
  }

  hasSave(): boolean {
    return (
      this.storage.getItem(LIVE_KEY) !== null ||
      this.storage.getItem(LEGACY_LIVE_KEY) !== null
    )
  }
}

export {
  LIVE_KEY,
  BACKUP_KEY,
  TEMP_KEY,
  LEGACY_LIVE_KEY,
  LEGACY_BACKUP_KEY,
  EXPORT_PREFIX,
}
