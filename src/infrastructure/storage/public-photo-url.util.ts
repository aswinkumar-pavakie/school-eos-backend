// Deterministic Supabase Storage public-object URL for the "person-photos"
// bucket. Plain functions, not top-level constants -- these get called from
// inside repository query-builder methods (i.e. at request time), which
// matters because the module require graph resolves before Nest's
// ConfigModule loads .env into process.env, so a top-level `const` built from
// SUPABASE_URL here would freeze in as undefined regardless of what's in the
// env file.

export function personPhotoPublicUrl(objectKey: string): string {
  return `${process.env.SUPABASE_URL ?? ''}/storage/v1/object/public/person-photos/${objectKey}`;
}

/** Same URL, built as a raw-SQL expression -- for repositories that compute
 * photoUrl directly in the SELECT list rather than in application code.
 * `objectKeyColumn` is a column reference (e.g. `p.photo_object_key`), never
 * user input, so string-building the SQL is safe here. */
export function personPhotoPublicUrlSql(objectKeyColumn: string): string {
  const base = `${process.env.SUPABASE_URL ?? ''}/storage/v1/object/public/person-photos/`;
  return `(CASE WHEN ${objectKeyColumn} IS NOT NULL THEN '${base}' || ${objectKeyColumn} END)`;
}
