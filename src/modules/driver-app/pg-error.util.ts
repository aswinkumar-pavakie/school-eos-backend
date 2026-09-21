// Shared Postgres error-code check for the Driver App module's own repository.
// 23505 = unique_violation (bus_boarding_correction_event_unique -- a second
// void attempt on an already-voided boarding event).

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
