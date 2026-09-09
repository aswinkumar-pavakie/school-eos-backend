// Shared Postgres error-code checks for the Attendance module's repositories.
// 23505 = unique_violation.

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
