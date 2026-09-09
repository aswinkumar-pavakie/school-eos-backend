import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';
import { personPhotoPublicUrlSql } from '../../../infrastructure/storage/public-photo-url.util';

export interface StaffRow {
  id: string;
  personId: string;
  firstName: string;
  lastName: string | null;
  employeeNo: string;
  designation: string | null;
  teacherCategory: string | null;
  postType: string | null;
  stateTeacherId: string | null;
  isTeaching: boolean;
  dateOfJoining: string;
  dateOfExit: string | null;
  exitReason: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  photoUrl: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
}

export interface CreateStaffInput {
  personId: string;
  employeeNo: string;
  designation?: string | null;
  teacherCategory?: string | null;
  postType?: string | null;
  stateTeacherId?: string | null;
  isTeaching?: boolean;
  dateOfJoining: string;
}

export interface UpdateStaffInput {
  employeeNo?: string;
  designation?: string | null;
  teacherCategory?: string | null;
  postType?: string | null;
  stateTeacherId?: string | null;
  isTeaching?: boolean;
}

// A function, not a top-level constant -- see student.repository.ts's columns()
// for why (SUPABASE_URL isn't in process.env yet at module-load time).
const columns =
  () => `s.id, s.person_id AS "personId", p.first_name AS "firstName", p.last_name AS "lastName",
  s.employee_no AS "employeeNo", s.designation, s.teacher_category AS "teacherCategory",
  s.post_type AS "postType", s.state_teacher_id AS "stateTeacherId", s.is_teaching AS "isTeaching",
  s.date_of_joining AS "dateOfJoining", s.date_of_exit AS "dateOfExit", s.exit_reason AS "exitReason",
  s.status, s.created_at AS "createdAt", s.updated_at AS "updatedAt",
  ${personPhotoPublicUrlSql('p.photo_object_key')} AS "photoUrl",
  p.address_line1 AS "addressLine1", p.address_line2 AS "addressLine2", p.city, p.state, p.pincode`;

@Injectable()
export class StaffRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(
    filter: {
      status?: string;
      search?: string;
      designation?: string;
      isTeaching?: boolean;
      gradeId?: string;
      sectionId?: string;
      subjectId?: string;
      ids?: string[];
      limit: number;
      offset: number;
    },
    executor: Queryable = this.postgres,
  ): Promise<{ rows: StaffRow[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter.ids && filter.ids.length > 0) {
      params.push(filter.ids);
      conditions.push(`s.id = ANY($${params.length}::uuid[])`);
    }
    if (filter.status) {
      params.push(filter.status);
      conditions.push(`s.status = $${params.length}`);
    }
    if (filter.search) {
      params.push(`%${filter.search.toLowerCase()}%`);
      conditions.push(
        `(lower(p.first_name) LIKE $${params.length} OR lower(coalesce(p.last_name, '')) LIKE $${params.length} OR lower(s.employee_no) LIKE $${params.length})`,
      );
    }
    if (filter.designation) {
      params.push(`%${filter.designation.toLowerCase()}%`);
      conditions.push(`lower(s.designation) LIKE $${params.length}`);
    }
    if (filter.isTeaching !== undefined) {
      params.push(filter.isTeaching);
      conditions.push(`s.is_teaching = $${params.length}`);
    }
    // A teacher's actual assignments live in subject_offering (real teaching-assignment
    // table, see Timetable), not on staff itself -- so class/section/subject filters
    // for teaching faculty go through an EXISTS against it rather than a plain column.
    if (filter.gradeId || filter.sectionId || filter.subjectId) {
      const soConditions = [
        `so.teacher_staff_id = s.id`,
        `so.status = 'ACTIVE'`,
      ];
      if (filter.sectionId) {
        params.push(filter.sectionId);
        soConditions.push(`so.section_id = $${params.length}`);
      } else if (filter.gradeId) {
        params.push(filter.gradeId);
        soConditions.push(`sec.grade_id = $${params.length}`);
      }
      if (filter.subjectId) {
        params.push(filter.subjectId);
        soConditions.push(`so.subject_id = $${params.length}`);
      }
      conditions.push(
        `EXISTS (SELECT 1 FROM subject_offering so JOIN section sec ON sec.id = so.section_id WHERE ${soConditions.join(' AND ')})`,
      );
    }
    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await this.postgres.query<{ count: string }>(
      `SELECT count(*) FROM staff s JOIN person p ON p.id = s.person_id ${where}`,
      params,
    );
    const rowParams = [...params, filter.limit, filter.offset];
    const { rows } = await executor.query<StaffRow>(
      `SELECT ${columns()} FROM staff s JOIN person p ON p.id = s.person_id ${where}
       ORDER BY p.first_name, p.last_name
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      rowParams,
    );
    return { rows, total: parseInt(countResult.rows[0].count, 10) };
  }

  /** Real distinct designation strings in use -- backs a designation dropdown
   * scoped to teaching vs non-teaching, since there's no separate department/
   * function table on staff, only this free-text column. */
  async findDistinctDesignations(
    isTeaching: boolean | undefined,
    executor: Queryable = this.postgres,
  ): Promise<string[]> {
    const conditions = [`designation IS NOT NULL`];
    const params: unknown[] = [];
    if (isTeaching !== undefined) {
      params.push(isTeaching);
      conditions.push(`is_teaching = $${params.length}`);
    }
    const { rows } = await executor.query<{ designation: string }>(
      `SELECT DISTINCT designation FROM staff WHERE ${conditions.join(' AND ')} ORDER BY designation`,
      params,
    );
    return rows.map((r) => r.designation);
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<StaffRow | null> {
    const { rows } = await executor.query<StaffRow>(
      `SELECT ${columns()} FROM staff s JOIN person p ON p.id = s.person_id WHERE s.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findByPersonId(
    personId: string,
    executor: Queryable = this.postgres,
  ): Promise<StaffRow | null> {
    const { rows } = await executor.query<StaffRow>(
      `SELECT ${columns()} FROM staff s JOIN person p ON p.id = s.person_id WHERE s.person_id = $1`,
      [personId],
    );
    return rows[0] ?? null;
  }

  async create(
    input: CreateStaffInput,
    executor: Queryable = this.postgres,
  ): Promise<StaffRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO staff (person_id, employee_no, designation, teacher_category, post_type,
         state_teacher_id, is_teaching, date_of_joining)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, true), $8)
       RETURNING id`,
      [
        input.personId,
        input.employeeNo,
        input.designation ?? null,
        input.teacherCategory ?? null,
        input.postType ?? null,
        input.stateTeacherId ?? null,
        input.isTeaching ?? null,
        input.dateOfJoining,
      ],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  async update(
    id: string,
    input: UpdateStaffInput,
    executor: Queryable = this.postgres,
  ): Promise<StaffRow | null> {
    const { rows } = await executor.query<{ id: string }>(
      `UPDATE staff SET
         employee_no = COALESCE($2, employee_no),
         designation = COALESCE($3, designation),
         teacher_category = COALESCE($4, teacher_category),
         post_type = COALESCE($5, post_type),
         state_teacher_id = COALESCE($6, state_teacher_id),
         is_teaching = COALESCE($7, is_teaching),
         updated_at = now()
       WHERE id = $1
       RETURNING id`,
      [
        id,
        input.employeeNo ?? null,
        input.designation ?? null,
        input.teacherCategory ?? null,
        input.postType ?? null,
        input.stateTeacherId ?? null,
        input.isTeaching ?? null,
      ],
    );
    if (rows.length === 0) return null;
    return this.findById(id, executor);
  }

  /** Atomic: status and date_of_exit must change together, per the DB's own
   * staff_exit_consistent CHECK (status='EXITED' <=> date_of_exit IS NOT NULL). */
  async exit(
    id: string,
    exitReason: string,
    dateOfExit: string,
    executor: Queryable = this.postgres,
  ): Promise<StaffRow | null> {
    const { rows } = await executor.query<{ id: string }>(
      `UPDATE staff SET status = 'EXITED', date_of_exit = $2, exit_reason = $3, updated_at = now()
       WHERE id = $1
       RETURNING id`,
      [id, dateOfExit, exitReason],
    );
    if (rows.length === 0) return null;
    return this.findById(id, executor);
  }
}
