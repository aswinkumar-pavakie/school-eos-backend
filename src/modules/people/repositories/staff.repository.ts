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
  experienceYears: number | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  photoUrl: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  // Real person-table columns (already selected elsewhere, e.g.
  // person.repository.ts's own ROW_COLUMNS) -- just never previously joined
  // onto the staff profile response. Added so the Faculty profile detail
  // view (Principal/Vice Principal/Admin) can show real contact/gender data
  // instead of fabricating it -- no schema change, no write path touched.
  email: string | null;
  mobile: string | null;
  gender: string | null;
  // Added for the Admit Faculty page (Admin) -- see query.md's own
  // "Admit Faculty page" section for the DDL. departmentId/campusId are
  // real FKs onto the pre-existing department/campus tables, not new lookup
  // tables of their own.
  departmentId: string | null;
  campusId: string | null;
  bloodGroup: string | null;
  employmentType: string | null;
  staffRoom: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  highestQualification: string | null;
  specialization: string | null;
  university: string | null;
  yearOfGraduation: number | null;
  tetNetCleared: boolean | null;
  areasOfExpertise: string | null;
  certifications: string | null;
  workshopsTraining: string | null;
  achievementsAwards: string | null;
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
  experienceYears?: number | null;
  departmentId?: string | null;
  campusId?: string | null;
  bloodGroup?: string | null;
  employmentType?: string | null;
  staffRoom?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  highestQualification?: string | null;
  specialization?: string | null;
  university?: string | null;
  yearOfGraduation?: number | null;
  tetNetCleared?: boolean | null;
  areasOfExpertise?: string | null;
  certifications?: string | null;
  workshopsTraining?: string | null;
  achievementsAwards?: string | null;
}

export interface UpdateStaffInput {
  employeeNo?: string;
  designation?: string | null;
  teacherCategory?: string | null;
  postType?: string | null;
  stateTeacherId?: string | null;
  isTeaching?: boolean;
  experienceYears?: number | null;
  departmentId?: string | null;
  campusId?: string | null;
  bloodGroup?: string | null;
  employmentType?: string | null;
  staffRoom?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  highestQualification?: string | null;
  specialization?: string | null;
  university?: string | null;
  yearOfGraduation?: number | null;
  tetNetCleared?: boolean | null;
  areasOfExpertise?: string | null;
  certifications?: string | null;
  workshopsTraining?: string | null;
  achievementsAwards?: string | null;
}

// A function, not a top-level constant -- see student.repository.ts's columns()
// for why (SUPABASE_URL isn't in process.env yet at module-load time).
const columns =
  () => `s.id, s.person_id AS "personId", p.first_name AS "firstName", p.last_name AS "lastName",
  s.employee_no AS "employeeNo", s.designation, s.teacher_category AS "teacherCategory",
  s.post_type AS "postType", s.state_teacher_id AS "stateTeacherId", s.is_teaching AS "isTeaching",
  s.date_of_joining AS "dateOfJoining", s.date_of_exit AS "dateOfExit", s.exit_reason AS "exitReason",
  s.experience_years AS "experienceYears",
  s.status, s.created_at AS "createdAt", s.updated_at AS "updatedAt",
  ${personPhotoPublicUrlSql('p.photo_object_key')} AS "photoUrl",
  p.address_line1 AS "addressLine1", p.address_line2 AS "addressLine2", p.city, p.state, p.pincode,
  p.email, p.mobile, p.gender,
  s.department_id AS "departmentId", s.campus_id AS "campusId", s.blood_group AS "bloodGroup",
  s.employment_type AS "employmentType", s.staff_room AS "staffRoom",
  s.emergency_contact_name AS "emergencyContactName", s.emergency_contact_phone AS "emergencyContactPhone",
  s.highest_qualification AS "highestQualification", s.specialization, s.university,
  s.year_of_graduation AS "yearOfGraduation", s.tet_net_cleared AS "tetNetCleared",
  s.areas_of_expertise AS "areasOfExpertise", s.certifications, s.workshops_training AS "workshopsTraining",
  s.achievements_awards AS "achievementsAwards"`;

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
    // A class-teacher login carries a system staff row (advisor lookups need one)
    // but is not an employee: keep it out of every real staff list.
    conditions.push(
      `NOT EXISTS (SELECT 1 FROM class_teacher_login ctl WHERE ctl.login_person_id = s.person_id)`,
    );
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
    const conditions = [
      `designation IS NOT NULL`,
      `NOT EXISTS (SELECT 1 FROM class_teacher_login ctl WHERE ctl.login_person_id = staff.person_id)`,
    ];
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
         state_teacher_id, is_teaching, date_of_joining, experience_years, department_id,
         campus_id, blood_group, employment_type, staff_room, emergency_contact_name,
         emergency_contact_phone, highest_qualification, specialization, university,
         year_of_graduation, tet_net_cleared, areas_of_expertise, certifications,
         workshops_training, achievements_awards)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, true), $8, $9, $10, $11, $12, $13, $14,
         $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
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
        input.experienceYears ?? null,
        input.departmentId ?? null,
        input.campusId ?? null,
        input.bloodGroup ?? null,
        input.employmentType ?? null,
        input.staffRoom ?? null,
        input.emergencyContactName ?? null,
        input.emergencyContactPhone ?? null,
        input.highestQualification ?? null,
        input.specialization ?? null,
        input.university ?? null,
        input.yearOfGraduation ?? null,
        input.tetNetCleared ?? null,
        input.areasOfExpertise ?? null,
        input.certifications ?? null,
        input.workshopsTraining ?? null,
        input.achievementsAwards ?? null,
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
         experience_years = COALESCE($8, experience_years),
         department_id = COALESCE($9, department_id),
         campus_id = COALESCE($10, campus_id),
         blood_group = COALESCE($11, blood_group),
         employment_type = COALESCE($12, employment_type),
         staff_room = COALESCE($13, staff_room),
         emergency_contact_name = COALESCE($14, emergency_contact_name),
         emergency_contact_phone = COALESCE($15, emergency_contact_phone),
         highest_qualification = COALESCE($16, highest_qualification),
         specialization = COALESCE($17, specialization),
         university = COALESCE($18, university),
         year_of_graduation = COALESCE($19, year_of_graduation),
         tet_net_cleared = COALESCE($20, tet_net_cleared),
         areas_of_expertise = COALESCE($21, areas_of_expertise),
         certifications = COALESCE($22, certifications),
         workshops_training = COALESCE($23, workshops_training),
         achievements_awards = COALESCE($24, achievements_awards),
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
        input.experienceYears ?? null,
        input.departmentId ?? null,
        input.campusId ?? null,
        input.bloodGroup ?? null,
        input.employmentType ?? null,
        input.staffRoom ?? null,
        input.emergencyContactName ?? null,
        input.emergencyContactPhone ?? null,
        input.highestQualification ?? null,
        input.specialization ?? null,
        input.university ?? null,
        input.yearOfGraduation ?? null,
        input.tetNetCleared ?? null,
        input.areasOfExpertise ?? null,
        input.certifications ?? null,
        input.workshopsTraining ?? null,
        input.achievementsAwards ?? null,
      ],
    );
    if (rows.length === 0) return null;
    return this.findById(id, executor);
  }

  /** Same pattern as student.repository.ts's findMaxAdmissionSeqForYear --
   * backs GET /staff/next-employee-id. Not year-scoped like admission
   * numbers (real data uses a flat EMP#### sequence, not EMP<year>####). */
  async findMaxEmployeeSeq(
    executor: Queryable = this.postgres,
  ): Promise<number | null> {
    const { rows } = await executor.query<{ employee_no: string }>(
      `SELECT employee_no FROM staff
       WHERE employee_no ~ '^EMP[0-9]{4}$'
       ORDER BY employee_no DESC
       LIMIT 1`,
    );
    if (rows.length === 0) return null;
    return parseInt(rows[0].employee_no.slice(-4), 10);
  }

  /** Class-teacher logins this person currently holds (their seats). */
  async findHeldClassLogins(personId: string, executor: Queryable = this.postgres): Promise<string[]> {
    const { rows } = await executor.query<{ id: string }>(
      `SELECT class_teacher_login_id AS id
       FROM class_teacher_login_assignment
       WHERE faculty_person_id = $1 AND status = 'ACTIVE'`,
      [personId],
    );
    return rows.map((r) => r.id);
  }

  /** Ends a person's hold on every class seat and revokes each seat login's
   * advisor role, so nobody but the admin can re-use the shared login. */
  async releaseClassSeats(personId: string, revokedBy: string, executor: Queryable = this.postgres): Promise<void> {
    await executor.query(
      `UPDATE role_assignment SET status = 'REVOKED', revoked_at = now(), revoked_by = $2, updated_at = now()
       WHERE status = 'ACTIVE' AND role_code = 'CLASS_ADVISOR'
         AND person_id IN (SELECT class_teacher_login_id FROM class_teacher_login_assignment
                           WHERE faculty_person_id = $1 AND status = 'ACTIVE')`,
      [personId, revokedBy],
    );
    await executor.query(
      `UPDATE class_teacher_login_assignment SET status = 'ENDED', unassigned_on = now()
       WHERE faculty_person_id = $1 AND status = 'ACTIVE'`,
      [personId],
    );
  }

  /** Revokes every active role of a person (used when they leave the school). */
  async revokeAllRoles(personId: string, revokedBy: string, executor: Queryable = this.postgres): Promise<void> {
    await executor.query(
      `UPDATE role_assignment SET status = 'REVOKED', revoked_at = now(), revoked_by = $2, updated_at = now()
       WHERE person_id = $1 AND status = 'ACTIVE'`,
      [personId, revokedBy],
    );
  }

  /** Deletes push tokens so a departed person's phone stops receiving alerts. */
  async removeDeviceTokens(personId: string, executor: Queryable = this.postgres): Promise<void> {
    await executor.query(`DELETE FROM person_device_token WHERE person_id = $1`, [personId]);
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
