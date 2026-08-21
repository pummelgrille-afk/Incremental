import { checksum } from '../utils/hash'
import { decodeBase64, encodeBase64 } from '../utils/encoding'
import { migrate, MigrationError, type RawSave } from './saveMigrations'
import {
  createDefaultSave,
  SCHEMA_VERSION,
  validateSave,
  type SaveData,
} from './saveSchema'
import { defaultStorage, StorageQuotaError, type StorageBackend } from './storage'

/**
 * Save orchestration: read, write, export, import.
 *
 * The public surface is deliberately narrow — `load`, `save`, `exportString`,
 * `importString`, `clear` — so the localStorage-to-IndexedDB migration path in
 * ADR-002 stays open. Callers never learn which backend is underneath.
 */

const LIVE_KEY = 'perihelion:save'
const BACKUP_KEY = 'perihelion:save:backup'
const TEMP_KEY = 'perihelion:save:temp'

/**
 * The keys used before the Phase 29 reskin.
 *
 * Read-only, and never written to again. The reskin's blanket rename moved the
 * storage key along with everything else, which would have made every existing
 * save **invisible**: the game looks under the new key, finds nothing, reports
 * a fresh start, and the schema 5 → 6 migration never even runs because there
 * is nothing to migrate. Total silent data loss, with no error anywhere and
 * nothing in `notices` to hint at it.
 *
 * The first successful load from a legacy key writes to the new one on the next
 * autosave, so the move happens once and needs no player action.
 */
const LEGACY_LIVE_KEY = 'orrery:save'
const LEGACY_BACKUP_KEY = 'orrery:save:backup'

/**
 * Prefix on exported strings, so a wrong paste is diagnosed not decoded.
 *
 * **Deliberately not renamed.** It is a wire format: every save string a player
 * has already exported to a file or a forum post begins with it, and changing
 * it would reject all of them. It survived the reskin by luck — the rename
 * mapped `Orrery`, not `ORRERY` — and it stays.
 */
const EXPORT_PREFIX = 'ORRERY'

export type LoadSource = 'live' | 'backup' | 'legacy' | 'fresh'

export interface LoadResult {
  data: SaveData
  /** Which key the save came from — `fresh` means a new game was created. */
  source: LoadSource
  /** Real seconds since the save was written. Phase 27 reads this. */
  offlineSeconds: number
  /** Repairs and migrations applied. Worth logging; never silently dropped. */
  notices: string[]
}

export class SaveImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SaveImportError'
  }
}

export class SaveManager {
  private lastWriteFailed = false

  constructor(private readonly storage: StorageBackend = defaultStorage()) {}

  // -------------------------------------------------------------------------
  // Load
  // -------------------------------------------------------------------------

  /**
   * Read the save, falling back to the backup key and then to a new game.
   *
   * Never throws. A player whose save is unreadable gets a fresh start with an
   * explanation in `notices`, which is bad but recoverable; a thrown error at
   * boot would be neither.
   */
  load(now = Date.now()): LoadResult {
    const notices: string[] = []

    for (const [key, source] of [
      [LIVE_KEY, 'live'],
      [BACKUP_KEY, 'backup'],
      // Pre-reskin keys, tried last: a save under the current key always wins.
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

  /** Parse → migrate → validate. Returns null if the save is unusable. */
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

  // -------------------------------------------------------------------------
  // Write
  // -------------------------------------------------------------------------

  /**
   * Corruption-safe write, per ADR-002 requirement 2.
   *
   *   1. Serialize and write to a temp key.
   *   2. Read it back and confirm it parses — catches a truncated write.
   *   3. Promote the current live save to backup.
   *   4. Swap temp into live, then clear temp.
   *
   * If any step fails, the live save is left exactly as it was. Losing one
   * autosave is survivable; a half-written live key is not.
   *
   * Returns false on failure rather than throwing — this runs from the tick
   * loop, and a failed write must never break the game (requirement 5).
   */
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

      // Read-back check. A quota failure can truncate rather than throw.
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

      // Quota is the one failure worth surfacing — the player can act on it.
      if (error instanceof StorageQuotaError) return false
      return false
    }
  }

  /** True when the most recent write failed. Drives a UI warning in Phase 42. */
  get writeFailing(): boolean {
    return this.lastWriteFailed
  }

  // -------------------------------------------------------------------------
  // Export / import
  //
  // ADR-002 requirement 3, and not optional: localStorage is destroyed by
  // "clear browsing data", which would otherwise silently erase 25-40 hours.
  // -------------------------------------------------------------------------

  /**
   * A portable save string: `ORRERY-<schema>-<checksum>-<base64>`.
   *
   * The checksum makes a truncated paste — the common failure when copying out
   * of a chat window — fail loudly instead of loading as a corrupt save.
   */
  exportString(data: SaveData): string {
    const json = JSON.stringify({ ...data, schemaVersion: SCHEMA_VERSION })
    const encoded = encodeBase64(json)
    return `${EXPORT_PREFIX}-${SCHEMA_VERSION}-${checksum(encoded)}-${encoded}`
  }

  /**
   * Parse an export string. Throws SaveImportError with a message meant to be
   * shown to the player — this is a path they walk by hand.
   *
   * Does not write anything; the caller decides whether to commit.
   */
  importString(text: string, now = Date.now()): SaveData {
    const trimmed = text.trim()
    if (trimmed.length === 0) throw new SaveImportError('Nothing to import.')

    const parts = trimmed.split('-')
    if (parts.length < 4 || parts[0] !== EXPORT_PREFIX) {
      throw new SaveImportError('That does not look like an Perihelion save string.')
    }

    const version = Number(parts[1])
    if (!Number.isInteger(version) || version < 1) {
      throw new SaveImportError('Save string has an unreadable version tag.')
    }
    if (version > SCHEMA_VERSION) {
      throw new SaveImportError(
        `That save is from a newer version of the game (schema ${version}). ` +
          'Update before importing it.',
      )
    }

    const expected = parts[2]
    // Rejoin the remainder: base64 has no '-', but splitting is safer than
    // assuming it never will after a future format change.
    const encoded = parts.slice(3).join('-')

    if (checksum(encoded) !== expected) {
      throw new SaveImportError(
        'Save string is damaged or incomplete — check that the whole string was copied.',
      )
    }

    let json: string
    try {
      json = decodeBase64(encoded)
    } catch {
      throw new SaveImportError('Save string could not be decoded.')
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(json)
    } catch {
      throw new SaveImportError('Save string does not contain valid save data.')
    }

    let candidate: RawSave
    try {
      candidate = migrate(parsed as RawSave).save
    } catch (error) {
      throw new SaveImportError(
        error instanceof MigrationError ? error.message : 'Save could not be migrated.',
      )
    }

    const validation = validateSave(candidate, now)
    if (!validation.ok || !validation.data) {
      throw new SaveImportError(
        `Save string failed validation: ${validation.problems.join('; ')}`,
      )
    }

    return validation.data
  }

  // -------------------------------------------------------------------------

  /**
   * Wipe every key. The player-facing hard reset.
   *
   * Includes the legacy keys, or a reset would appear to work and then the old
   * save would come back on the next load — which is worse than not resetting.
   */
  clear(): void {
    this.storage.removeItem(LIVE_KEY)
    this.storage.removeItem(BACKUP_KEY)
    this.storage.removeItem(TEMP_KEY)
    this.storage.removeItem(LEGACY_LIVE_KEY)
    this.storage.removeItem(LEGACY_BACKUP_KEY)
  }

  /** True when a save exists. Drives "Continue" vs "New game" in the menu. */
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
