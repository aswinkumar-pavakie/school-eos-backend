// Shared Postgres error-code checks for the People (Staff & Student Records) module's
// repositories. 23505 = unique_violation, 23503 = foreign_key_violation.

interface PgErrorLike {
  code?: string;
  constraint?: string;
}

export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as PgErrorLike).code === '23505'
  );
}

/** Which unique/exclusion constraint fired, when `isUniqueViolation`/`isCheckViolation`
 * is true -- lets the caller give a different message for two different constraints
 * on the same table instead of one generic "duplicate" error for both. */
export function constraintName(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null
    ? (err as PgErrorLike).constraint
    : undefined;
}

export function isForeignKeyViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as PgErrorLike).code === '23503'
  );
}

export function isCheckViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as PgErrorLike).code === '23514'
  );
}
