
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
