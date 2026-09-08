// Shared Postgres error-code checks -- same 3 functions duplicated per module
// in this codebase (see community-proposals/pg-error.util.ts,
// community-initiatives/pg-error.util.ts, communities/pg-error.util.ts).
// 23505 = unique_violation, 23503 = foreign_key_violation, 23514 = check_violation.

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
