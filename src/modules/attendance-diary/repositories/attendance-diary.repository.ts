// Read-only SQL for the Attendance Diary. Every statement is parameterized; the only
// text ever interpolated into SQL is a fixed whitelist (sort keys, band predicates)
// chosen by this file -- never a caller-supplied string.
//
// Scope is passed IN as an explicit list of section ids (students) / a scope
// discriminator (employees) that the service resolved from the database for the
// authenticated caller. Nothing in this repository decides who may see what; it only
// ever narrows to the scope it is handed.

import { Injectable } from '@nestjs/common';
import { PostgresService } from '../../../infrastructure/postgres/postgres.service';

export interface CurrentYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

export interface StudentFilters {
  /** Section ids the caller may see. null = whole school (leadership roles only). */
  scopeSectionIds: string[] | null;
  gradeIds?: string[];
  sectionIds?: string[];
  q?: string;
  dayStatus?: string;
  percentBand?: string;
  residence?: string;
  transport?: string;
  gender?: string;
  sort?: string;
}

export interface EmployeeFilters {
  /** null = all employees (leadership roles); otherwise restrict to staff who teach / advise
   * these sections. Coordinators never see principal / vice principal. */
  scopeSectionIds: string[] | null;
  excludeLeadership: boolean;
  group?: string;
  q?: string;
  dayStatus?: string;
  percentBand?: string;
  departmentId?: string;
  sort?: string;
}

const PERCENT_BAND_SQL: Record<string, string> = {
  LT60: 'pct IS NOT NULL AND pct < 60',
  LT75: 'pct IS NOT NULL AND pct < 75',
  BETWEEN_75_90: 'pct IS NOT NULL AND pct >= 75 AND pct < 90',
  GTE90: 'pct IS NOT NULL AND pct >= 90',
};

const STUDENT_SORT_SQL: Record<string, string> = {
  NAME: 'first_name ASC, last_name ASC, student_id ASC',
  CLASS:
    'level_no ASC, grade_name ASC, section_name ASC, roll_no ASC NULLS LAST, first_name ASC, student_id ASC',
  PERCENT_ASC: 'pct ASC NULLS LAST, first_name ASC, student_id ASC',
  PERCENT_DESC: 'pct DESC NULLS LAST, first_name ASC, student_id ASC',
};

const EMPLOYEE_SORT_SQL: Record<string, string> = {
  NAME: 'first_name ASC, last_name ASC, staff_id ASC',
  PERCENT_ASC: 'pct ASC NULLS LAST, first_name ASC, staff_id ASC',
  PERCENT_DESC: 'pct DESC NULLS LAST, first_name ASC, staff_id ASC',
};

/** Escape LIKE metacharacters so a search box can never behave as a pattern. */
function likeTerm(q: string): string {
  return `%${q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

class Params {
  readonly values: unknown[] = [];
  add(v: unknown): string {
    this.values.push(v);
    return `$${this.values.length}`;
  }
}

@Injectable()
export class AttendanceDiaryRepository {
  constructor(private readonly postgres: PostgresService) {}

  async getCurrentYear(): Promise<CurrentYear | null> {
    const { rows } = await this.postgres.query(
      `SELECT id, name, start_date AS "startDate", end_date AS "endDate"
       FROM academic_year WHERE is_current LIMIT 1`,
    );
    return rows[0] ?? null;
  }

  /** Active role codes held by this person (source of truth is the table, not the JWT). */
  async getActiveRoleCodes(personId: string): Promise<string[]> {
    const { rows } = await this.postgres.query(
      `SELECT DISTINCT role_code FROM role_assignment
       WHERE person_id = $1 AND status = 'ACTIVE'
         AND valid_from <= CURRENT_DATE AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)`,
      [personId],
    );
    return rows.map((r: any) => r.role_code);
  }

  async getCoordinatorScopeRows(
    personId: string,
  ): Promise<
    { scopeType: string; scopeStage: string | null; scopeId: string | null }[]
  > {
    const { rows } = await this.postgres.query(
      `SELECT scope_type AS "scopeType", scope_stage AS "scopeStage", scope_id AS "scopeId"
       FROM role_assignment
       WHERE person_id = $1 AND role_code = 'ACADEMIC_COORDINATOR' AND status = 'ACTIVE'
         AND valid_from <= CURRENT_DATE AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)`,
      [personId],
    );
    return rows;
  }

  /** Current-year sections belonging to the given grades / stages / (or all, if schoolWide). */
  async sectionIdsForGradeScope(
    gradeIds: string[],
    stages: string[],
    schoolWide: boolean,
  ): Promise<string[]> {
    const { rows } = await this.postgres.query(
      `SELECT sec.id
       FROM section sec JOIN grade g ON g.id = sec.grade_id
       WHERE sec.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
         AND ($3::boolean OR g.id = ANY($1::uuid[]) OR g.stage = ANY($2::text[]))`,
      [gradeIds, stages, schoolWide],
    );
    return rows.map((r: any) => r.id);
  }

  /** Sections this person is the ACTIVE class advisor of (role grant + active staff row). */
  async advisorSectionIds(personId: string): Promise<string[]> {
    const { rows } = await this.postgres.query(
      `SELECT DISTINCT sec.id
       FROM role_assignment ra
       JOIN section sec ON sec.id = ra.scope_id
         AND sec.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
       JOIN staff s ON s.person_id = ra.person_id AND s.status = 'ACTIVE'
       WHERE ra.role_code = 'CLASS_ADVISOR' AND ra.scope_type = 'SECTION'
         AND ra.person_id = $1 AND ra.status = 'ACTIVE'`,
      [personId],
    );
    return rows.map((r: any) => r.id);
  }

  /** Sections in which this person is the ACTIVE holder of a class-teacher seat. */
  async seatHolderSectionIds(personId: string): Promise<string[]> {
    const { rows } = await this.postgres.query(
      `SELECT DISTINCT a.section_id AS id
       FROM class_teacher_login_assignment a
       JOIN section sec ON sec.id = a.section_id
         AND sec.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
       WHERE a.faculty_person_id = $1 AND a.status = 'ACTIVE'`,
      [personId],
    );
    return rows.map((r: any) => r.id);
  }

  /** Sections in which this person actively teaches a subject offering. */
  async teachingSectionIds(personId: string): Promise<string[]> {
    const { rows } = await this.postgres.query(
      `SELECT DISTINCT so.section_id AS id
       FROM subject_offering so
       JOIN staff st ON st.id = so.teacher_staff_id AND st.status = 'ACTIVE' AND st.person_id = $1
       JOIN section sec ON sec.id = so.section_id
         AND sec.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
       WHERE so.status = 'ACTIVE'`,
      [personId],
    );
    return rows.map((r: any) => r.id);
  }

  /** Filter options (grades + sections) restricted to the caller's scope. */
  async listClassOptions(scopeSectionIds: string[] | null) {
    const { rows } = await this.postgres.query(
      `SELECT g.id AS "gradeId", g.name AS "gradeName", g.level_no AS "levelNo", g.stage,
              sec.id AS "sectionId", sec.name AS "sectionName"
       FROM section sec JOIN grade g ON g.id = sec.grade_id
       WHERE sec.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
         AND ($1::uuid[] IS NULL OR sec.id = ANY($1::uuid[]))
       ORDER BY g.level_no, sec.name`,
      [scopeSectionIds],
    );
    return rows;
  }

  async listDepartments(): Promise<{ id: string; name: string }[]> {
    const { rows } = await this.postgres.query(
      `SELECT id, name FROM department ORDER BY name`,
    );
    return rows;
  }

  // ------------------------------------------------------------------ students

  private studentCte(f: StudentFilters, date: string, p: Params): string {
    const where: string[] = [`s.status = 'ACTIVE'`];
    const scopeP = p.add(f.scopeSectionIds);
    where.push(
      `(${scopeP}::uuid[] IS NULL OR sec.id = ANY(${scopeP}::uuid[]))`,
    );
    if (f.gradeIds?.length)
      where.push(`g.id = ANY(${p.add(f.gradeIds)}::uuid[])`);
    if (f.sectionIds?.length)
      where.push(`sec.id = ANY(${p.add(f.sectionIds)}::uuid[])`);
    if (f.residence === 'HOSTEL') where.push('s.is_hosteller');
    if (f.residence === 'DAY_SCHOLAR') where.push('NOT s.is_hosteller');
    if (f.transport === 'BUS') where.push('s.uses_school_transport');
    if (f.transport === 'NO_BUS') where.push('NOT s.uses_school_transport');
    if (f.gender) where.push(`p.gender = ${p.add(f.gender)}`);
    if (f.q?.trim()) {
      const t = p.add(likeTerm(f.q));
      where.push(
        `(p.first_name ILIKE ${t} ESCAPE '\\' OR COALESCE(p.last_name,'') ILIKE ${t} ESCAPE '\\'
          OR (p.first_name || ' ' || COALESCE(p.last_name,'')) ILIKE ${t} ESCAPE '\\'
          OR s.admission_no ILIKE ${t} ESCAPE '\\')`,
      );
    }
    const dateP = p.add(date);
    const outer: string[] = [];
    if (f.dayStatus) outer.push(`day_status = ${p.add(f.dayStatus)}`);
    if (f.percentBand && PERCENT_BAND_SQL[f.percentBand])
      outer.push(PERCENT_BAND_SQL[f.percentBand]);

    return `
      WITH cur AS (SELECT id, start_date FROM academic_year WHERE is_current LIMIT 1),
      roster AS (
        SELECT s.id AS student_id, p.first_name, p.last_name, s.admission_no, e.roll_no,
               sec.id AS section_id, sec.name AS section_name, g.id AS grade_id,
               g.name AS grade_name, g.level_no, s.is_hosteller, s.uses_school_transport,
               p.gender, p.photo_object_key
        FROM student s
        JOIN person p ON p.id = s.person_id
        JOIN student_enrolment e ON e.student_id = s.id AND e.status = 'ACTIVE'
          AND e.academic_year_id = (SELECT id FROM cur)
        JOIN section sec ON sec.id = e.section_id
        JOIN grade g ON g.id = sec.grade_id
        WHERE ${where.join(' AND ')}
      ),
      lc AS (
        SELECT DISTINCT ON (attendance_record_id) attendance_record_id, new_status
        FROM attendance_correction ORDER BY attendance_record_id, corrected_at DESC
      ),
      eff AS (
        SELECT ar.student_id, se.session_date, COALESCE(lc.new_status, ar.status) AS status,
               ar.reason, se.marked_at
        FROM attendance_session se
        JOIN attendance_record ar ON ar.session_id = se.id
        LEFT JOIN lc ON lc.attendance_record_id = ar.id
        WHERE se.session_type = 'DAILY'
          AND se.section_id IN (SELECT DISTINCT section_id FROM roster)
          AND se.session_date BETWEEN (SELECT start_date FROM cur) AND ${dateP}::date
      ),
      ytd AS (
        SELECT student_id, count(*)::int AS total_days,
               count(*) FILTER (WHERE status IN ('PRESENT','LATE'))::int AS present_days
        FROM eff GROUP BY student_id
      ),
      joined AS (
        SELECT r.*, COALESCE(d.status, 'NOT_MARKED') AS day_status, d.reason, d.marked_at,
               COALESCE(y.total_days, 0) AS total_days, COALESCE(y.present_days, 0) AS present_days,
               CASE WHEN y.total_days > 0 THEN round(100.0 * y.present_days / y.total_days, 1) END AS pct
        FROM roster r
        LEFT JOIN ytd y ON y.student_id = r.student_id
        LEFT JOIN eff d ON d.student_id = r.student_id AND d.session_date = ${dateP}::date
      ),
      filtered AS (SELECT * FROM joined ${outer.length ? 'WHERE ' + outer.join(' AND ') : ''})`;
  }

  async findStudents(
    f: StudentFilters,
    date: string,
    page: number,
    pageSize: number,
  ) {
    const p = new Params();
    const cte = this.studentCte(f, date, p);
    const order = STUDENT_SORT_SQL[f.sort ?? 'CLASS'] ?? STUDENT_SORT_SQL.CLASS;
    const limitP = p.add(pageSize);
    const offsetP = p.add((page - 1) * pageSize);
    const summaryParams = [...p.values.slice(0, p.values.length - 2)];
    const [list, summary] = await Promise.all([
      this.postgres.query(
        `${cte}
         SELECT student_id AS "studentId", first_name AS "firstName", last_name AS "lastName",
                admission_no AS "admissionNo", roll_no AS "rollNo", section_id AS "sectionId",
                section_name AS "sectionName", grade_id AS "gradeId", grade_name AS "gradeName",
                is_hosteller AS "isHosteller", uses_school_transport AS "usesSchoolTransport",
                gender, photo_object_key AS "photoObjectKey",
                day_status AS "dayStatus", reason, marked_at AS "markedAt",
                total_days AS "totalDays", present_days AS "presentDays", pct AS "percentage",
                count(*) OVER()::int AS "total"
         FROM filtered ORDER BY ${order} LIMIT ${limitP} OFFSET ${offsetP}`,
        p.values,
      ),
      this.postgres.query(
        `${cte}
         SELECT count(*)::int AS total,
                count(*) FILTER (WHERE day_status = 'PRESENT')::int AS present,
                count(*) FILTER (WHERE day_status = 'ABSENT')::int AS absent,
                count(*) FILTER (WHERE day_status = 'LATE')::int AS late,
                count(*) FILTER (WHERE day_status = 'NOT_MARKED')::int AS "notMarked",
                round(avg(pct), 1) AS "averagePercentage",
                count(*) FILTER (WHERE pct IS NOT NULL AND pct < 75)::int AS "below75"
         FROM filtered`,
        summaryParams,
      ),
    ]);
    return { rows: list.rows, summary: summary.rows[0] };
  }

  // ------------------------------------------------------- one student's profile

  /** Identity + class for ONE student, only if they sit inside the caller's scope
   * (scopeSectionIds null = whole school). Out-of-scope and non-existent look identical. */
  async getStudentHeader(studentId: string, scopeSectionIds: string[] | null) {
    const { rows } = await this.postgres.query(
      `SELECT s.id AS "studentId", p.first_name AS "firstName", p.last_name AS "lastName",
              s.admission_no AS "admissionNo", e.roll_no AS "rollNo", p.gender,
              sec.id AS "sectionId", sec.name AS "sectionName", g.id AS "gradeId", g.name AS "gradeName",
              s.is_hosteller AS "isHosteller", s.uses_school_transport AS "usesSchoolTransport"
       FROM student s
       JOIN person p ON p.id = s.person_id
       JOIN student_enrolment e ON e.student_id = s.id AND e.status = 'ACTIVE'
         AND e.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
       JOIN section sec ON sec.id = e.section_id
       JOIN grade g ON g.id = sec.grade_id
       WHERE s.id = $1 AND s.status = 'ACTIVE'
         AND ($2::uuid[] IS NULL OR sec.id = ANY($2::uuid[]))`,
      [studentId, scopeSectionIds],
    );
    return rows[0] ?? null;
  }

  /** Every DAILY attendance day for this student this year up to `date` (newest first), with
   * corrections applied. One student is at most ~250 rows a year. */
  async getStudentHistory(studentId: string, date: string) {
    const { rows } = await this.postgres.query(
      `WITH lc AS (
         SELECT DISTINCT ON (attendance_record_id) attendance_record_id, new_status
         FROM attendance_correction
         WHERE attendance_record_id IN (SELECT id FROM attendance_record WHERE student_id = $1)
         ORDER BY attendance_record_id, corrected_at DESC)
       SELECT to_char(se.session_date, 'YYYY-MM-DD') AS date,
              COALESCE(lc.new_status, ar.status) AS status, ar.reason, se.marked_at AS "markedAt"
       FROM attendance_session se
       JOIN attendance_record ar ON ar.session_id = se.id AND ar.student_id = $1
       LEFT JOIN lc ON lc.attendance_record_id = ar.id
       WHERE se.session_type = 'DAILY'
         AND se.session_date BETWEEN (SELECT start_date FROM academic_year WHERE is_current LIMIT 1) AND $2::date
       ORDER BY se.session_date DESC`,
      [studentId, date],
    );
    return rows as {
      date: string;
      status: string;
      reason: string | null;
      markedAt: string | null;
    }[];
  }

  // ----------------------------------------------------------------- employees

  private employeeCte(f: EmployeeFilters, date: string, p: Params): string {
    const where: string[] = [
      `s.status = 'ACTIVE'`,
      // Only real people who hold a working role -- never shared / seat / device logins.
      `EXISTS (SELECT 1 FROM role_assignment ra WHERE ra.person_id = s.person_id AND ra.status = 'ACTIVE'
               AND ra.role_code IN ('FACULTY','PRINCIPAL','VICE_PRINCIPAL'))`,
    ];
    if (f.excludeLeadership) {
      where.push(
        `NOT EXISTS (SELECT 1 FROM role_assignment lr WHERE lr.person_id = s.person_id AND lr.status = 'ACTIVE'
                     AND lr.role_code IN ('PRINCIPAL','VICE_PRINCIPAL'))`,
      );
    }
    if (f.scopeSectionIds) {
      const sc = p.add(f.scopeSectionIds);
      where.push(
        `(EXISTS (SELECT 1 FROM subject_offering so WHERE so.teacher_staff_id = s.id AND so.status = 'ACTIVE'
                  AND so.section_id = ANY(${sc}::uuid[]))
          OR EXISTS (SELECT 1 FROM class_teacher_login_assignment a WHERE a.faculty_person_id = s.person_id
                  AND a.status = 'ACTIVE' AND a.section_id = ANY(${sc}::uuid[])))`,
      );
    }
    if (f.departmentId)
      where.push(`s.department_id = ${p.add(f.departmentId)}`);
    if (f.q?.trim()) {
      const t = p.add(likeTerm(f.q));
      where.push(
        `(p.first_name ILIKE ${t} ESCAPE '\\' OR COALESCE(p.last_name,'') ILIKE ${t} ESCAPE '\\'
          OR (p.first_name || ' ' || COALESCE(p.last_name,'')) ILIKE ${t} ESCAPE '\\'
          OR s.employee_no ILIKE ${t} ESCAPE '\\')`,
      );
    }
    const dateP = p.add(date);
    const outer: string[] = [];
    if (f.group) outer.push(`grp = ${p.add(f.group)}`);
    if (f.dayStatus) outer.push(`day_status = ${p.add(f.dayStatus)}`);
    if (f.percentBand && PERCENT_BAND_SQL[f.percentBand])
      outer.push(PERCENT_BAND_SQL[f.percentBand]);

    // "Latest event of the day wins" -- same rule the staff-attendance roster uses. The day
    // boundary is the school's own (IST), not the database server's timezone.
    return `
      WITH cur AS (SELECT start_date FROM academic_year WHERE is_current LIMIT 1),
      roster AS (
        SELECT s.id AS staff_id, s.person_id, p.first_name, p.last_name, s.employee_no, s.designation,
               s.department_id, d.name AS department_name, p.photo_object_key,
               CASE
                 WHEN EXISTS (SELECT 1 FROM role_assignment r1 WHERE r1.person_id = s.person_id AND r1.status = 'ACTIVE' AND r1.role_code = 'PRINCIPAL') THEN 'PRINCIPAL'
                 WHEN EXISTS (SELECT 1 FROM role_assignment r2 WHERE r2.person_id = s.person_id AND r2.status = 'ACTIVE' AND r2.role_code = 'VICE_PRINCIPAL') THEN 'VICE_PRINCIPAL'
                 ELSE 'FACULTY' END AS grp
        FROM staff s
        JOIN person p ON p.id = s.person_id
        LEFT JOIN department d ON d.id = s.department_id
        WHERE ${where.join(' AND ')}
      ),
      ev AS (
        SELECT DISTINCT ON (e.staff_id, ((e.occurred_at AT TIME ZONE 'Asia/Kolkata')::date))
               e.staff_id, (e.occurred_at AT TIME ZONE 'Asia/Kolkata')::date AS day,
               e.event_type, e.occurred_at, e.reason
        FROM staff_attendance_event e
        WHERE e.staff_id IN (SELECT staff_id FROM roster)
          AND e.state <> 'REJECTED'
          AND (e.occurred_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN (SELECT start_date FROM cur) AND ${dateP}::date
        ORDER BY e.staff_id, ((e.occurred_at AT TIME ZONE 'Asia/Kolkata')::date), e.occurred_at DESC
      ),
      ytd AS (
        SELECT staff_id, count(*)::int AS total_days,
               count(*) FILTER (WHERE event_type IN ('CHECK_IN','ON_DUTY'))::int AS present_days
        FROM ev GROUP BY staff_id
      ),
      joined AS (
        SELECT r.*,
               CASE
                 WHEN d.event_type = 'CHECK_IN' THEN 'PRESENT'
                 WHEN d.event_type = 'ON_DUTY' THEN 'ON_DUTY'
                 WHEN lv.staff_id IS NOT NULL THEN 'ON_LEAVE'
                 WHEN d.event_type = 'ABSENT' THEN 'ABSENT'
                 ELSE 'NOT_MARKED' END AS day_status,
               d.occurred_at AS event_at, d.reason,
               COALESCE(y.total_days, 0) AS total_days, COALESCE(y.present_days, 0) AS present_days,
               CASE WHEN y.total_days > 0 THEN round(100.0 * y.present_days / y.total_days, 1) END AS pct
        FROM roster r
        LEFT JOIN ytd y ON y.staff_id = r.staff_id
        LEFT JOIN ev d ON d.staff_id = r.staff_id AND d.day = ${dateP}::date
        LEFT JOIN LATERAL (
          SELECT l.staff_id FROM staff_leave_request l
          WHERE l.staff_id = r.staff_id AND l.state = 'APPROVED'
            AND ${dateP}::date BETWEEN l.from_date AND l.to_date LIMIT 1
        ) lv ON true
      ),
      filtered AS (SELECT * FROM joined ${outer.length ? 'WHERE ' + outer.join(' AND ') : ''})`;
  }

  async findEmployees(
    f: EmployeeFilters,
    date: string,
    page: number,
    pageSize: number,
  ) {
    const p = new Params();
    const cte = this.employeeCte(f, date, p);
    const order = EMPLOYEE_SORT_SQL[f.sort ?? 'NAME'] ?? EMPLOYEE_SORT_SQL.NAME;
    const limitP = p.add(pageSize);
    const offsetP = p.add((page - 1) * pageSize);
    const summaryParams = [...p.values.slice(0, p.values.length - 2)];
    const [list, summary] = await Promise.all([
      this.postgres.query(
        `${cte}
         SELECT staff_id AS "staffId", person_id AS "personId", first_name AS "firstName", last_name AS "lastName",
                employee_no AS "employeeNo", designation, grp AS "group", department_id AS "departmentId",
                department_name AS "departmentName", photo_object_key AS "photoObjectKey",
                day_status AS "dayStatus", event_at AS "eventAt", reason,
                total_days AS "totalDays", present_days AS "presentDays", pct AS "percentage",
                count(*) OVER()::int AS "total"
         FROM filtered ORDER BY ${order} LIMIT ${limitP} OFFSET ${offsetP}`,
        p.values,
      ),
      this.postgres.query(
        `${cte}
         SELECT count(*)::int AS total,
                count(*) FILTER (WHERE day_status = 'PRESENT')::int AS present,
                count(*) FILTER (WHERE day_status = 'ABSENT')::int AS absent,
                count(*) FILTER (WHERE day_status = 'ON_DUTY')::int AS "onDuty",
                count(*) FILTER (WHERE day_status = 'ON_LEAVE')::int AS "onLeave",
                count(*) FILTER (WHERE day_status = 'NOT_MARKED')::int AS "notMarked",
                round(avg(pct), 1) AS "averagePercentage"
         FROM filtered`,
        summaryParams,
      ),
    ]);
    return { rows: list.rows, summary: summary.rows[0] };
  }
}
