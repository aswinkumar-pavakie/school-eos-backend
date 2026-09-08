// Shared Postgres error-code checks for the Student Events (event permission)
// module's repositories. 23505 = unique_violation, 23503 = foreign_key_violation.

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

export function isForeignKeyViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as PgErrorLike).code === '23503'
  );
}
