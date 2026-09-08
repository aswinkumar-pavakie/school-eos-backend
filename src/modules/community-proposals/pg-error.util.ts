// Shared Postgres error-code checks for the Community Proposals module's repository.
// 23503 = foreign_key_violation.

interface PgErrorLike {
  code?: string;
}

export function isForeignKeyViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as PgErrorLike).code === '23503'
  );
}
