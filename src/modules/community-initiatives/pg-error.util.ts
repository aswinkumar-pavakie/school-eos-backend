// Shared Postgres error-code checks for the Community Initiatives module's repository.
// 23505 = unique_violation, 23503 = foreign_key_violation.

interface PgErrorLike {
  code?: string;
}

export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as PgErrorLike).code === '23505'
  );
}

export function isForeignKeyViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as PgErrorLike).code === '23503'
  );
}
