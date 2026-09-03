// Reads via v_active_role_assignment rather than re-deriving its WHERE clause here:
// the view already encodes status='ACTIVE' AND valid_from<=today AND (valid_to IS NULL
// OR valid_to>=today) exactly once, so identity and every future module stay in sync
// with a single definition of "active" instead of two copies drifting apart.

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface ActiveRoleAssignment {
  roleCode: string;
  scopeType: string;
  scopeId: string | null;
}

@Injectable()
export class RoleAssignmentRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findActiveByPersonId(
    personId: string,
    executor: Queryable = this.postgres,
  ): Promise<ActiveRoleAssignment[]> {
    const { rows } = await executor.query<{
      role_code: string;
      scope_type: string;
      scope_id: string | null;
    }>(
      `SELECT role_code, scope_type, scope_id
       FROM v_active_role_assignment
       WHERE person_id = $1
       ORDER BY role_code`,
      [personId],
    );
    return rows.map((row) => ({
      roleCode: row.role_code,
      scopeType: row.scope_type,
      scopeId: row.scope_id,
    }));
  }
}
