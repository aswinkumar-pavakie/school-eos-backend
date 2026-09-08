// Warden-to-hostel scoping source of truth: role_assignment with
// role_code='HOSTEL_WARDEN', scope_type='HOSTEL', scope_id=<hostel.id>,
// status='ACTIVE' -- verified against real, live data (grant-role-assignment.dto.ts
// already accepts 'HOSTEL' as a scope_type; HOSTEL_WARDEN already exists as a role_code
// in role.repository.ts's ROLE_MODULE_ACCESS map). This is NOT an invented relationship,
// mirroring ClassAdvisorRepository (messaging module) and
// ApproverAssignmentRepository.personHoldsRole (approvals module) exactly.
//
// Admin grants a warden through the existing generic role-assignment endpoint
// (POST /role-assignments with roleCode='HOSTEL_WARDEN', scopeType='HOSTEL',
// scopeId=<hostel.id>) -- no new Admin-side code needed.
//
// hostel.warden_staff_id (a single legacy FK already on the hostel row) is
// deliberately NOT used here -- role_assignment is the real authorization source,
// consistent with Class Advisor, and supports a warden someday covering more than
// one hostel without a schema change.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

@Injectable()
export class WardenAssignmentRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** Every hostel this person currently holds an ACTIVE HOSTEL_WARDEN assignment for. */
  async findActiveHostelIdsForPerson(
    personId: string,
    executor: Queryable = this.postgres,
  ): Promise<string[]> {
    const { rows } = await executor.query<{ scope_id: string }>(
      `SELECT scope_id FROM v_active_role_assignment
       WHERE person_id = $1 AND role_code = 'HOSTEL_WARDEN' AND scope_type = 'HOSTEL'`,
      [personId],
    );
    return rows.map((row) => row.scope_id);
  }

  /** True iff this person currently holds an ACTIVE HOSTEL_WARDEN assignment for this exact hostel. */
  async personWardensHostel(
    personId: string,
    hostelId: string,
    executor: Queryable = this.postgres,
  ): Promise<boolean> {
    const { rows } = await executor.query(
      `SELECT 1 FROM v_active_role_assignment
       WHERE person_id = $1 AND role_code = 'HOSTEL_WARDEN' AND scope_type = 'HOSTEL' AND scope_id = $2
       LIMIT 1`,
      [personId, hostelId],
    );
    return rows.length > 0;
  }
}
