// Mirrors role_assignment's own CHECK constraint so a bad scope combination comes back
// as a friendly 400 instead of a raw Postgres constraint-violation message. The DB
// constraint remains the real guarantee -- this is purely a nicer error for the same rule:
//   (scope_type='SCHOOL' AND scope_id IS NULL AND scope_stage IS NULL)
//   OR (scope_type='STAGE' AND scope_id IS NULL AND scope_stage IS NOT NULL)
//   OR (scope_type NOT IN ('SCHOOL','STAGE') AND scope_id IS NOT NULL)

import { BadRequestException } from '@nestjs/common';

interface ScopeInput {
  scopeType: string;
  scopeId?: string | null;
  scopeStage?: string | null;
}

export function assertValidRoleScope(input: ScopeInput): void {
  const { scopeType, scopeId, scopeStage } = input;

  if (scopeType === 'SCHOOL') {
    if (scopeId || scopeStage) {
      throw new BadRequestException(
        'scope_type SCHOOL must not have a scope_id or scope_stage.',
      );
    }
    return;
  }

  if (scopeType === 'STAGE') {
    if (scopeId) {
      throw new BadRequestException(
        'scope_type STAGE must not have a scope_id.',
      );
    }
    if (!scopeStage) {
      throw new BadRequestException('scope_type STAGE requires scope_stage.');
    }
    return;
  }

  if (!scopeId) {
    throw new BadRequestException(
      `scope_type ${scopeType} requires a scope_id.`,
    );
  }
}

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
