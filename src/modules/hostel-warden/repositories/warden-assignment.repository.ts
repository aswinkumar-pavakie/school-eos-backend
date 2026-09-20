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

  /** The reverse of findActiveHostelIdsForPerson: every real person who
   * currently wardens this exact hostel -- used to notify them the moment a
   * new Call Request comes in (a hostel legitimately having no assigned
   * warden yet returns an empty array, not an error). */
  async findPersonIdsForHostel(
    hostelId: string,
    executor: Queryable = this.postgres,
  ): Promise<string[]> {
    const { rows } = await executor.query<{ person_id: string }>(
      `SELECT person_id FROM v_active_role_assignment
       WHERE role_code = 'HOSTEL_WARDEN' AND scope_type = 'HOSTEL' AND scope_id = $1`,
      [hostelId],
    );
    return rows.map((row) => row.person_id);
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

  /** Every ACTIVE co-warden across the caller's own hostel(s) -- the real,
   * well-scoped relationship backing the Warden mobile app's own "Warden
   * roster" screen (Warden App.dc.html's own `staff` block). Deliberately
   * scoped to exactly the caller's own hostels (via WardenContextService's
   * hostelIds), never a school-wide staff directory -- a Warden should see
   * co-wardens of hostels they administer, not every staff member in the
   * school. */
  async findRosterForHostels(
    hostelIds: string[],
    executor: Queryable = this.postgres,
  ): Promise<{ personId: string; firstName: string; lastName: string | null; mobile: string | null; hostelId: string; hostelName: string }[]> {
    if (hostelIds.length === 0) return [];
    const { rows } = await executor.query<{
      person_id: string;
      first_name: string;
      last_name: string | null;
      mobile: string | null;
      hostel_id: string;
      hostel_name: string;
    }>(
      `SELECT p.id AS person_id, p.first_name, p.last_name, p.mobile,
              h.id AS hostel_id, h.name AS hostel_name
       FROM v_active_role_assignment ra
       JOIN person p ON p.id = ra.person_id
       JOIN hostel h ON h.id = ra.scope_id
       WHERE ra.role_code = 'HOSTEL_WARDEN' AND ra.scope_type = 'HOSTEL' AND ra.scope_id = ANY($1)
       ORDER BY h.name, p.first_name`,
      [hostelIds],
    );
    return rows.map((r) => ({
      personId: r.person_id,
      firstName: r.first_name,
      lastName: r.last_name,
      mobile: r.mobile,
      hostelId: r.hostel_id,
      hostelName: r.hostel_name,
    }));
  }
}
