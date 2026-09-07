// The Parent app's real authorization boundary: role alone (@Roles('PARENT')) only
// proves "this caller is *a* parent", never "this caller may see *this* student" —
// every studentId-scoped endpoint must additionally check a real, ACTIVE
// guardian_link row exists between the caller and that exact student before
// touching anything of theirs. access_level further distinguishes FULL (view + pay)
// from VIEW_ONLY (view only) from NO_FINANCE (blocked from Finance data entirely,
// including seeing it) — real values, confirmed against guardian_link's own CHECK
// constraint, not invented.

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface ParentChildRow {
  studentId: string;
  studentName: string;
  gradeName: string | null;
  sectionName: string | null;
  mediumName: string | null;
  rollNo: string | null;
  relationship: string;
  isPrimaryContact: boolean;
  accessLevel: string;
}

function mapChild(row: any): ParentChildRow {
  return {
    studentId: row.student_id,
    studentName: row.student_name,
    gradeName: row.grade_name,
    sectionName: row.section_name,
    mediumName: row.medium_name,
    rollNo: row.roll_no,
    relationship: row.relationship,
    isPrimaryContact: row.is_primary_contact,
    accessLevel: row.access_level,
  };
}

@Injectable()
export class GuardianLinkRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** Every active child linked to this parent, via the real v_parent_children view (already joins student/person/enrolment/section/grade/medium, ACTIVE-only, ordered oldest-grade-first). */
  async listChildren(personId: string, executor: Queryable = this.postgres): Promise<ParentChildRow[]> {
    const { rows } = await executor.query(
      `SELECT * FROM v_parent_children WHERE parent_person_id = $1 ORDER BY display_order`,
      [personId],
    );
    return rows.map(mapChild);
  }

  /** The one real link row this parent+student pair resolves to, or null if there is none (never linked, or REVOKED) — the authorization check every fees endpoint runs first. */
  async findActiveLink(
    personId: string,
    studentId: string,
    executor: Queryable = this.postgres,
  ): Promise<{ accessLevel: string } | null> {
    const { rows } = await executor.query(
      `SELECT access_level FROM guardian_link WHERE person_id = $1 AND student_id = $2 AND status = 'ACTIVE'`,
      [personId, studentId],
    );
    return rows.length ? { accessLevel: rows[0].access_level } : null;
  }
}
