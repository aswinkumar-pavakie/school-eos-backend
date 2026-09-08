// Mirrors calendar_event's own CHECK constraint so a bad scope combination comes back as
// a friendly 400 instead of a raw Postgres constraint-violation message (same pattern as
// admin/scope-validation.ts for role_assignment):
//   (scope_type='SCHOOL' AND scope_id IS NULL AND scope_stage IS NULL)
//   OR (scope_type='STAGE' AND scope_id IS NULL AND scope_stage IS NOT NULL)
//   OR (scope_type IN ('CAMPUS','GRADE','SECTION') AND scope_id IS NOT NULL)

import { BadRequestException } from '@nestjs/common';

interface CalendarScopeInput {
  scopeType?: string;
  scopeId?: string | null;
  scopeStage?: string | null;
}

export function assertValidCalendarEventScope(input: CalendarScopeInput): void {
  const scopeType = input.scopeType ?? 'SCHOOL';

  if (scopeType === 'SCHOOL') {
    if (input.scopeId || input.scopeStage) {
      throw new BadRequestException(
        'scope_type SCHOOL must not have a scope_id or scope_stage.',
      );
    }
    return;
  }

  if (scopeType === 'STAGE') {
    if (input.scopeId) {
      throw new BadRequestException(
        'scope_type STAGE must not have a scope_id.',
      );
    }
    if (!input.scopeStage) {
      throw new BadRequestException('scope_type STAGE requires scope_stage.');
    }
    return;
  }

  // CAMPUS, GRADE, SECTION
  if (!input.scopeId) {
    throw new BadRequestException(
      `scope_type ${scopeType} requires a scope_id.`,
    );
  }
  if (input.scopeStage) {
    throw new BadRequestException(
      `scope_type ${scopeType} must not have a scope_stage.`,
    );
  }
}
