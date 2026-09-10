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

  /** The reverse of personHoldsRole: every real person who currently holds this
   * role, in this scope (or, when scope is null, everyone holding the role at
   * all -- same "no scope required" reading personHoldsRole itself uses) --
   * used once, right when a request is first created, to notify every real
   * approver who can act on it that something is now waiting on them. */
  async findPersonIdsForRoleAndScope(
    roleCode: string,
    scope: ApproverScope | null,
    executor: Queryable = this.postgres,
  ): Promise<string[]> {
    const { rows } = await executor.query(
      `SELECT DISTINCT person_id FROM v_active_role_assignment
       WHERE role_code = $1
         AND ($2::text IS NULL OR (scope_type = $2 AND scope_id::text = $3))`,
      [roleCode, scope?.scopeType ?? null, scope?.scopeId ?? null],
    );
    return rows.map((r: any) => r.person_id);
  }
}
