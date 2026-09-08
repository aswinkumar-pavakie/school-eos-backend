import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface LibraryMemberRow {
  id: string;
  personId: string;
  firstName: string;
  lastName: string | null;
  memberType: string;
  identifier: string | null; // admission no / employee no, whichever applies
  gradeId: string | null;
  gradeName: string | null;
  sectionId: string | null;
  sectionName: string | null;
  maxBooksAllowed: number;
  status: string;
  suspendedReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LibraryMemberListRow extends LibraryMemberRow {
  activeIssuesCount: number;
  overdueCount: number;
  pendingFinesAmountPaise: string;
}

export interface EligiblePersonRow {
  personId: string;
  firstName: string;
  lastName: string | null;
  memberType: 'STUDENT' | 'STAFF';
  identifier: string | null;
}

export interface CreateMemberInput {
  personId: string;
  memberType: 'STUDENT' | 'STAFF';
  maxBooksAllowed?: number;
}

export interface MemberFilter {
  search?: string;
  status?: string;
  memberType?: string;
  gradeId?: string;
  sectionId?: string;
  limit: number;
  offset: number;
}

const COLUMNS = `m.id, m.person_id AS "personId", p.first_name AS "firstName", p.last_name AS "lastName",
  m.member_type AS "memberType",
  (CASE WHEN m.member_type = 'STUDENT' THEN s.admission_no ELSE st.employee_no END) AS "identifier",
  g.id AS "gradeId", g.name AS "gradeName", sec.id AS "sectionId", sec.name AS "sectionName",
  m.max_books_allowed AS "maxBooksAllowed", m.status, m.suspended_reason AS "suspendedReason",
  m.created_at AS "createdAt", m.updated_at AS "updatedAt"`;
// Same "current ACTIVE enrolment for the current academic year" join as
// people/repositories/student.repository.ts's CURRENT_ENROLMENT_JOIN -- a
// student member's grade/section is read from there, never duplicated here.
const FROM = `library_member m
  JOIN person p ON p.id = m.person_id
  LEFT JOIN student s ON s.person_id = p.id AND m.member_type = 'STUDENT'
  LEFT JOIN staff st ON st.person_id = p.id AND m.member_type = 'STAFF'
  LEFT JOIN student_enrolment se ON se.student_id = s.id AND se.status = 'ACTIVE'
    AND se.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
  LEFT JOIN section sec ON sec.id = se.section_id
  LEFT JOIN grade g ON g.id = sec.grade_id`;

@Injectable()
export class LibraryMemberRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(filter: MemberFilter, executor: Queryable = this.postgres): Promise<{ rows: LibraryMemberListRow[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.search) {
      params.push(`%${filter.search.toLowerCase()}%`);
      conditions.push(
        `(lower(p.first_name) LIKE $${params.length} OR lower(coalesce(p.last_name, '')) LIKE $${params.length}
          OR lower(coalesce(s.admission_no, '')) LIKE $${params.length} OR lower(coalesce(st.employee_no, '')) LIKE $${params.length})`,
      );
    }
    if (filter.status) {
      params.push(filter.status);
      conditions.push(`m.status = $${params.length}`);
    }
    if (filter.memberType) {
      params.push(filter.memberType);
      conditions.push(`m.member_type = $${params.length}`);
    }
    if (filter.gradeId) {
      params.push(filter.gradeId);
      conditions.push(`g.id = $${params.length}`);
    }
    if (filter.sectionId) {
      params.push(filter.sectionId);
      conditions.push(`sec.id = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countResult = await this.postgres.query<{ count: string }>(
      `SELECT count(*) FROM ${FROM} ${where}`,
      params,
    );
    const rowParams = [...params, filter.limit, filter.offset];
    const { rows } = await executor.query<LibraryMemberListRow>(
      `SELECT ${COLUMNS},
              COALESCE(iss.active, 0) AS "activeIssuesCount",
              COALESCE(iss.overdue, 0) AS "overdueCount",
              COALESCE(fin.pending, 0) AS "pendingFinesAmountPaise"
       FROM ${FROM}
       LEFT JOIN LATERAL (
         SELECT count(*) FILTER (WHERE status IN ('ISSUED', 'OVERDUE')) AS active,
                count(*) FILTER (WHERE status IN ('ISSUED', 'OVERDUE') AND due_date < current_date) AS overdue
         FROM library_issue WHERE member_id = m.id
       ) iss ON true
       LEFT JOIN LATERAL (
         SELECT sum(amount_paise) AS pending FROM library_fine
         WHERE member_id = m.id AND status IN ('PENDING', 'SENT_TO_FINANCE', 'PARTIALLY_PAID')
       ) fin ON true
       ${where}
       ORDER BY p.first_name, p.last_name
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      rowParams,
    );
    return {
      rows: rows.map((r) => ({
        ...r,
        activeIssuesCount: Number(r.activeIssuesCount),
        overdueCount: Number(r.overdueCount),
        pendingFinesAmountPaise: String(r.pendingFinesAmountPaise),
      })),
      total: parseInt(countResult.rows[0].count, 10),
    };
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<LibraryMemberRow | null> {
    const { rows } = await executor.query<LibraryMemberRow>(`SELECT ${COLUMNS} FROM ${FROM} WHERE m.id = $1`, [id]);
    return rows[0] ?? null;
  }

  /** "Which library_member row is *this* logged-in person" -- Faculty's own
   * self-service view resolves its own memberId this way rather than ever
   * trusting a client-supplied one (not every real STAFF/STUDENT person is
   * necessarily an opted-in library member -- null is a genuine, honest
   * "no library card yet" answer, not an error). */
  async findByPersonId(personId: string, executor: Queryable = this.postgres): Promise<LibraryMemberRow | null> {
    const { rows } = await executor.query<LibraryMemberRow>(`SELECT ${COLUMNS} FROM ${FROM} WHERE m.person_id = $1`, [personId]);
    return rows[0] ?? null;
  }

  async findByIdForUpdate(id: string, executor: Queryable): Promise<LibraryMemberRow | null> {
    const { rows } = await executor.query<LibraryMemberRow>(
      `SELECT ${COLUMNS} FROM ${FROM} WHERE m.id = $1 FOR UPDATE OF m`,
      [id],
    );
    return rows[0] ?? null;
  }

  /** Active students and staff not already opted in as a library member --
   * backs the "add member" picker. */
  async findEligiblePeople(search: string | undefined, executor: Queryable = this.postgres): Promise<EligiblePersonRow[]> {
    const params: unknown[] = [];
    let searchClause = '';
    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      searchClause = `AND (lower(p.first_name) LIKE $1 OR lower(coalesce(p.last_name, '')) LIKE $1 OR lower(s.admission_no) LIKE $1)`;
    }
    const studentParams = [...params];
    let staffSearchClause = '';
    if (search) {
      staffSearchClause = `AND (lower(p.first_name) LIKE $1 OR lower(coalesce(p.last_name, '')) LIKE $1 OR lower(st.employee_no) LIKE $1)`;
    }

    const { rows } = await executor.query<EligiblePersonRow>(
      `(SELECT p.id AS "personId", p.first_name AS "firstName", p.last_name AS "lastName",
               'STUDENT' AS "memberType", s.admission_no AS "identifier"
        FROM student s
        JOIN person p ON p.id = s.person_id
        WHERE s.status = 'ACTIVE'
          AND NOT EXISTS (SELECT 1 FROM library_member lm WHERE lm.person_id = p.id)
          ${searchClause}
        LIMIT 20)
       UNION ALL
       (SELECT p.id, p.first_name, p.last_name, 'STAFF', st.employee_no
        FROM staff st
        JOIN person p ON p.id = st.person_id
        WHERE st.status = 'ACTIVE'
          AND NOT EXISTS (SELECT 1 FROM library_member lm WHERE lm.person_id = p.id)
          ${staffSearchClause}
        LIMIT 20)
       ORDER BY "firstName", "lastName"
       LIMIT 30`,
      studentParams,
    );
    return rows;
  }

  async create(input: CreateMemberInput, executor: Queryable = this.postgres): Promise<LibraryMemberRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO library_member (person_id, member_type, max_books_allowed)
       VALUES ($1, $2, COALESCE($3, 3))
       RETURNING id`,
      [input.personId, input.memberType, input.maxBooksAllowed ?? null],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  async update(id: string, maxBooksAllowed: number | undefined, executor: Queryable = this.postgres): Promise<LibraryMemberRow | null> {
    await executor.query(
      `UPDATE library_member SET max_books_allowed = COALESCE($2, max_books_allowed), updated_at = now() WHERE id = $1`,
      [id, maxBooksAllowed ?? null],
    );
    return this.findById(id, executor);
  }

  async setStatus(
    id: string,
    status: string,
    suspendedReason: string | null,
    executor: Queryable = this.postgres,
  ): Promise<LibraryMemberRow | null> {
    await executor.query(
      `UPDATE library_member SET status = $2, suspended_reason = $3, updated_at = now() WHERE id = $1`,
      [id, status, suspendedReason],
    );
    return this.findById(id, executor);
  }

  async countActiveIssues(memberId: string, executor: Queryable = this.postgres): Promise<number> {
    const { rows } = await executor.query<{ count: string }>(
      `SELECT count(*) FROM library_issue WHERE member_id = $1 AND status IN ('ISSUED', 'OVERDUE')`,
      [memberId],
    );
    return parseInt(rows[0].count, 10);
  }

  async sumPendingFines(memberId: string, executor: Queryable = this.postgres): Promise<string> {
    const { rows } = await executor.query<{ total: string }>(
      `SELECT COALESCE(sum(amount_paise), 0) AS total FROM library_fine
       WHERE member_id = $1 AND status IN ('PENDING', 'SENT_TO_FINANCE')`,
      [memberId],
    );
    return rows[0].total;
  }
}
