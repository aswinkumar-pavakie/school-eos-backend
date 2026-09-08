// Answers "does this person actually hold this approver role, in this scope, right
// now" — the check behind 1.4/1.5's core rule: a step assigned to CLASS_ADVISOR is only
// approvable by the specific person holding that CLASS_ADVISOR role_assignment for the
// matching section, not by anyone whose JWT merely lists CLASS_ADVISOR among their roles.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface ApproverScope {
  scopeType: string;
  scopeId: string;
}

@Injectable()
export class ApproverAssignmentRepository {
  constructor(private readonly postgres: PostgresService) {}

  async personHoldsRole(
    personId: string,
    roleCode: string,
    scope: ApproverScope | null,
    executor: Queryable = this.postgres,
  ): Promise<boolean> {
    const { rows } = await executor.query(
      `SELECT 1 FROM v_active_role_assignment
       WHERE person_id = $1
         AND role_code = $2
         AND ($3::text IS NULL OR (scope_type = $3 AND scope_id::text = $4))
       LIMIT 1`,
      [personId, roleCode, scope?.scopeType ?? null, scope?.scopeId ?? null],
    );
    return rows.length > 0;
  }
}
