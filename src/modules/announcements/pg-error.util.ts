interface PgErrorLike {
  code?: string;
}

export function isForeignKeyViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as PgErrorLike).code === '23503';
}
