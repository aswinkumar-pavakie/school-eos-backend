// Reads via v_active_role_assignment rather than re-deriving its WHERE clause here:
// the view already encodes status='ACTIVE' AND valid_from<=today AND (valid_to IS NULL
// OR valid_to>=today) exactly once, so identity and every future module stay in sync
// with a single definition of "active" instead of two copies drifting apart.
//
// Extended for the Access (Identity, Roles & Assignments) module's grant/revoke screen:
// create(), revoke(), and findAllByPersonId() (every assignment, not just active ones,
// so a revoked assignment's history stays visible).

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface ActiveRoleAssignment {
  roleCode: string;
  scopeType: string;
  scopeId: string | null;
}

export interface RoleAssignmentRow {
  id: string;
  personId: string;
  roleCode: string;
  scopeType: string;
  scopeId: string | null;
  scopeStage: string | null;
  academicYearId: string | null;
  validFrom: string;
  validTo: string | null;
  status: string;
  assignedBy: string | null;
  revokedBy: string | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface GrantRoleAssignmentInput {
  personId: string;
  roleCode: string;
  scopeType: string;
  scopeId?: string | null;
  scopeStage?: string | null;
  academicYearId?: string | null;
  assignedBy: string;
}

export interface RoleAssignmentWithNamesRow extends RoleAssignmentRow {
  personFirstName: string;
  personLastName: string | null;
  scopeName: string | null;
  gradeName: string | null;
  academicYearName: string | null;
}

export interface RoleAssignmentFilter {
  personId?: string;
  roleCode?: string;
  scopeType?: string;
  scopeId?: string;
  status?: string;
}

function mapRow(row: {
  id: string;
  person_id: string;
  role_code: string;
  scope_type: string;
  scope_id: string | null;
  scope_stage: string | null;
  academic_year_id: string | null;
  valid_from: string;
  valid_to: string | null;
  status: string;
  assigned_by: string | null;
  revoked_by: string | null;
  revoked_at: Date | null;
  created_at: Date;
}): RoleAssignmentRow {
  return {
    id: row.id,
    personId: row.person_id,
    roleCode: row.role_code,
    scopeType: row.scope_type,
    scopeId: row.scope_id,
    scopeStage: row.scope_stage,
    academicYearId: row.academic_year_id,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    status: row.status,
    assignedBy: row.assigned_by,
    revokedBy: row.revoked_by,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  };
}

const ROW_COLUMNS = `id, person_id, role_code, scope_type, scope_id, scope_stage, academic_year_id,
       valid_from, valid_to, status, assigned_by, revoked_by, revoked_at, created_at`;

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

  /** Every assignment for a person, active or not -- the grant/revoke screen's history view. */
  async findAllByPersonId(
    personId: string,
    executor: Queryable = this.postgres,
  ): Promise<RoleAssignmentRow[]> {
    const { rows } = await executor.query(
      `SELECT ${ROW_COLUMNS}
       FROM role_assignment
       WHERE person_id = $1
       ORDER BY created_at DESC`,
      [personId],
    );
    return rows.map(mapRow);
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<RoleAssignmentRow | null> {
    const { rows } = await executor.query(
      `SELECT ${ROW_COLUMNS} FROM role_assignment WHERE id = $1`,
      [id],
    );
    return rows.length > 0 ? mapRow(rows[0]) : null;
  }

  /** Throws the raw Postgres error on constraint violation (duplicate active
   * assignment, or a second holder of a single-instance role like ADMIN/PRINCIPAL) --
   * the service layer translates that into a friendly 409. */
  async create(
    input: GrantRoleAssignmentInput,
    executor: Queryable = this.postgres,
  ): Promise<RoleAssignmentRow> {
    const { rows } = await executor.query(
      `INSERT INTO role_assignment
         (person_id, role_code, scope_type, scope_id, scope_stage, academic_year_id, assigned_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${ROW_COLUMNS}`,
      [
        input.personId,
        input.roleCode,
        input.scopeType,
        input.scopeId ?? null,
        input.scopeStage ?? null,
        input.academicYearId ?? null,
        input.assignedBy,
      ],
    );
    return mapRow(rows[0]);
  }

  /** Joined view for admin screens that need to *show* assignments (Class Advisor /
   * Academic Coordinator / Sports Faculty), not just check a person's own active
   * set -- resolves the person's name and, for a GRADE/SECTION scope, the
   * grade/section name too, in one query. */
  async findMany(
    filter: RoleAssignmentFilter,
    executor: Queryable = this.postgres,
  ): Promise<RoleAssignmentWithNamesRow[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.personId) {
      params.push(filter.personId);
      conditions.push(`ra.person_id = $${params.length}`);
    }
    if (filter.roleCode) {
      params.push(filter.roleCode);
      conditions.push(`ra.role_code = $${params.length}`);
    }
    if (filter.scopeType) {
      params.push(filter.scopeType);
      conditions.push(`ra.scope_type = $${params.length}`);
    }
    if (filter.scopeId) {
      params.push(filter.scopeId);
      conditions.push(`ra.scope_id = $${params.length}`);
    }
    if (filter.status) {
      params.push(filter.status);
      conditions.push(`ra.status = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await executor.query(
      `SELECT ra.id, ra.person_id, ra.role_code, ra.scope_type, ra.scope_id, ra.scope_stage,
              ra.academic_year_id, ra.valid_from, ra.valid_to, ra.status, ra.assigned_by,
              ra.revoked_by, ra.revoked_at, ra.created_at,
              p.first_name AS person_first_name, p.last_name AS person_last_name,
              COALESCE(sec.name, g.name) AS scope_name,
              COALESCE(g.name, sec_g.name) AS grade_name,
              ay.name AS academic_year_name
       FROM role_assignment ra
       JOIN person p ON p.id = ra.person_id
       LEFT JOIN section sec ON ra.scope_type = 'SECTION' AND sec.id = ra.scope_id
       LEFT JOIN grade sec_g ON sec_g.id = sec.grade_id
       LEFT JOIN grade g ON ra.scope_type = 'GRADE' AND g.id = ra.scope_id
       LEFT JOIN academic_year ay ON ay.id = ra.academic_year_id
       ${where}
       ORDER BY ra.created_at DESC`,
      params,
    );
    return rows.map((row: Record<string, unknown>) => ({
      ...mapRow(row as Parameters<typeof mapRow>[0]),
      personFirstName: row.person_first_name as string,
      gradeName: row.grade_name as string | null,
      academicYearName: row.academic_year_name as string | null,
      personLastName: row.person_last_name as string | null,
      scopeName: row.scope_name as string | null,
    }));
  }

  async revoke(
    id: string,
    revokedBy: string,
    executor: Queryable = this.postgres,
  ): Promise<RoleAssignmentRow | null> {
    const { rows } = await executor.query(
      `UPDATE role_assignment
       SET status = 'REVOKED', revoked_at = now(), revoked_by = $2, updated_at = now()
       WHERE id = $1 AND status = 'ACTIVE'
       RETURNING ${ROW_COLUMNS}`,
      [id, revokedBy],
    );
    return rows.length > 0 ? mapRow(rows[0]) : null;
  }
}
