/**
 * Content text: the names and descriptions authored in `content/*.ts`.
 *
 * These do **not** live in the catalogue, and that is the one structural
 * decision in this phase worth arguing for.
 *
 * CLAUDE.md says content is typed data authored in `content/`, and a Platform's
 * name belongs beside its attack and its interval — an author balancing a unit
 * should not have to open a second file to find out which one they are looking
 * at. Moving 140 names into `en.ts` would have bought type-checked keys at the
 * cost of making every content file a list of ids.
 *
 * So English content text stays where it was authored, and a translation
 * *overrides* it by key: `platform.bolt.name`, `contact.drifter.description`.
 * A locale that supplies nothing shows the authored English, which is the same
 * per-key fallback the catalogue has, arrived at from the other direction.
 *
 * The keys are derived from ids rather than declared, so adding a unit adds its
 * keys. `npm run i18n:extract` writes the current set out for a translator;
 * `tests/i18n.test.ts` checks that an override does not name content that has
 * been renamed away underneath it.
 */

/** Every kind of content whose text reaches the screen. */
export type ContentKind =
  | 'platform'
  | 'array'
  | 'zone'
  | 'stage'
  | 'upgrade'
  | 'achievement'
  | 'tutorial'
  | 'action'
  | 'palette'
  | 'epigraph'

export type ContentField = 'name' | 'description'

export type ContentKey = `${ContentKind}.${string}.${ContentField}`

export type ContentMessages = Partial<Record<ContentKey, string>>

export function contentKey(
  kind: ContentKind,
  id: string,
  field: ContentField,
): ContentKey {
  return `${kind}.${id}.${field}`
}
