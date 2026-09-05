import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';
import { personPhotoPublicUrlSql } from '../../../infrastructure/storage/public-photo-url.util';

export interface StudentRow {
  id: string;
  personId: string;
  firstName: string;
  lastName: string | null;
  admissionNo: string;
  stateStudentId: string | null;
  admissionDate: string;
  mediumId: string | null;
  motherTongue: string | null;
  languageSubjectChoice: string | null;
  communityCategory: string | null;
  isFirstGenLearner: boolean;
  isDifferentlyAbled: boolean;
  supportNeeds: string | null;
  bloodGroup: string | null;
  isHosteller: boolean;
  usesSchoolTransport: boolean;
  commuteMode: string | null;
  bankAccountRef: string | null;
  status: string;
  dateOfLeaving: string | null;
  createdAt: Date;
  updatedAt: Date;
  gradeId: string | null;
  gradeName: string | null;
  sectionId: string | null;
  sectionName: string | null;
  rollNo: number | null;
  photoUrl: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
}

export interface CreateStudentInput {
  personId: string;
  admissionNo: string;
  stateStudentId?: string | null;
  admissionDate: string;
  mediumId?: string | null;
  motherTongue?: string | null;
  languageSubjectChoice?: string | null;
  communityCategory?: string | null;
  isFirstGenLearner?: boolean;
  isDifferentlyAbled?: boolean;
  supportNeeds?: string | null;
  bloodGroup?: string | null;
  isHosteller?: boolean;
  usesSchoolTransport?: boolean;
  commuteMode?: string | null;
  bankAccountRef?: string | null;
}

export interface UpdateStudentInput {
  admissionNo?: string;
  stateStudentId?: string | null;
  mediumId?: string | null;
  motherTongue?: string | null;
  languageSubjectChoice?: string | null;
  communityCategory?: string | null;
  isFirstGenLearner?: boolean;
  isDifferentlyAbled?: boolean;
  supportNeeds?: string | null;
  bloodGroup?: string | null;
  isHosteller?: boolean;
  usesSchoolTransport?: boolean;
  commuteMode?: string | null;
  bankAccountRef?: string | null;
}

// A function, not a top-level constant -- personPhotoPublicUrlSql() reads
// SUPABASE_URL from process.env, which Nest's ConfigModule only populates once
// bootstrap runs, well after this module's top level would have already
// evaluated. Calling it inside each query-building method (i.e. at request
// time) instead keeps it correct.
const columns = () => `s.id, s.person_id AS "personId", p.first_name AS "firstName", p.last_name AS "lastName",
  s.admission_no AS "admissionNo", s.state_student_id AS "stateStudentId", s.admission_date AS "admissionDate",
  s.medium_id AS "mediumId", s.mother_tongue AS "motherTongue",
  s.language_subject_choice AS "languageSubjectChoice", s.community_category AS "communityCategory",
  s.is_first_gen_learner AS "isFirstGenLearner", s.is_differently_abled AS "isDifferentlyAbled",
  s.support_needs AS "supportNeeds", s.blood_group AS "bloodGroup", s.is_hosteller AS "isHosteller",
  s.uses_school_transport AS "usesSchoolTransport", s.commute_mode AS "commuteMode",
  s.bank_account_ref AS "bankAccountRef",
  s.status, s.date_of_leaving AS "dateOfLeaving", s.created_at AS "createdAt", s.updated_at AS "updatedAt",
  g.id AS "gradeId", g.name AS "gradeName", sec.id AS "sectionId", sec.name AS "sectionName",
  se.roll_no AS "rollNo",
  ${personPhotoPublicUrlSql('p.photo_object_key')} AS "photoUrl",
  p.address_line1 AS "addressLine1", p.address_line2 AS "addressLine2", p.city, p.state, p.pincode`;

// LEFT JOIN to the student's current-year, ACTIVE enrolment only -- a student can
// have historical enrolment rows from past years, but the list/detail views only
// ever want the live one. No current enrolment (a brand-new admission with no
// class assigned yet) is a valid state, not an error -- every column above stays
// null in that case.
const CURRENT_ENROLMENT_JOIN = `
  LEFT JOIN student_enrolment se ON se.student_id = s.id AND se.status = 'ACTIVE'
    AND se.academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
  LEFT JOIN section sec ON sec.id = se.section_id
  LEFT JOIN grade g ON g.id = sec.grade_id`;

@Injectable()
export class StudentRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(
    filter: {
      status?: string;
      search?: string;
      gradeId?: string;
      sectionId?: string;
      sectionName?: string;
      ids?: string[];
      limit: number;
      offset: number;
    },
    executor: Queryable = this.postgres,
  ): Promise<{ rows: StudentRow[]; total: number }> {
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
        `(lower(p.first_name) LIKE $${params.length} OR lower(coalesce(p.last_name, '')) LIKE $${params.length} OR lower(s.admission_no) LIKE $${params.length})`,
      );
    }
    if (filter.sectionId) {
      params.push(filter.sectionId);
      conditions.push(`sec.id = $${params.length}`);
    } else if (filter.gradeId) {
      params.push(filter.gradeId);
      conditions.push(`g.id = $${params.length}`);
    } else if (filter.sectionName) {
      params.push(filter.sectionName);
      conditions.push(`sec.name = $${params.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const fromClause = `FROM student s JOIN person p ON p.id = s.person_id ${CURRENT_ENROLMENT_JOIN}`;

    const countResult = await this.postgres.query<{ count: string }>(
      `SELECT count(*) ${fromClause} ${where}`,
      params,
    );
    const rowParams = [...params, filter.limit, filter.offset];
    const { rows } = await executor.query<StudentRow>(
      `SELECT ${columns()} ${fromClause} ${where}
       ORDER BY p.first_name, p.last_name
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      rowParams,
    );
    return { rows, total: parseInt(countResult.rows[0].count, 10) };
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<StudentRow | null> {
    const { rows } = await executor.query<StudentRow>(
      `SELECT ${columns()} FROM student s JOIN person p ON p.id = s.person_id ${CURRENT_ENROLMENT_JOIN} WHERE s.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findByPersonId(personId: string, executor: Queryable = this.postgres): Promise<StudentRow | null> {
    const { rows } = await executor.query<StudentRow>(
      `SELECT ${columns()} FROM student s JOIN person p ON p.id = s.person_id ${CURRENT_ENROLMENT_JOIN} WHERE s.person_id = $1`,
      [personId],
    );
    return rows[0] ?? null;
  }

  /** Just the person.gender behind a student -- for modules (Hostel) that need this
   * one fact for a validation rule but have no other reason to depend on Students. */
  async findGenderById(id: string, executor: Queryable = this.postgres): Promise<string | null> {
    const { rows } = await executor.query<{ gender: string | null }>(
      `SELECT p.gender FROM student s JOIN person p ON p.id = s.person_id WHERE s.id = $1`,
      [id],
    );
    return rows[0]?.gender ?? null;
  }

  async create(input: CreateStudentInput, executor: Queryable = this.postgres): Promise<StudentRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO student (person_id, admission_no, state_student_id, admission_date, medium_id,
         mother_tongue, language_subject_choice, community_category, is_first_gen_learner,
         is_differently_abled, support_needs, blood_group, is_hosteller, uses_school_transport,
         bank_account_ref, commute_mode)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, false), COALESCE($10, false), $11, $12,
         COALESCE($13, false), COALESCE($14, false), $15, $16)
       RETURNING id`,
      [
        input.personId,
        input.admissionNo,
        input.stateStudentId ?? null,
        input.admissionDate,
        input.mediumId ?? null,
        input.motherTongue ?? null,
        input.languageSubjectChoice ?? null,
        input.communityCategory ?? null,
        input.isFirstGenLearner ?? null,
        input.isDifferentlyAbled ?? null,
        input.supportNeeds ?? null,
        input.bloodGroup ?? null,
        input.isHosteller ?? null,
        input.usesSchoolTransport ?? null,
        input.bankAccountRef ?? null,
        input.commuteMode ?? null,
      ],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  async update(
    id: string,
    input: UpdateStudentInput,
    executor: Queryable = this.postgres,
  ): Promise<StudentRow | null> {
    const { rows } = await executor.query<{ id: string }>(
      `UPDATE student SET
         admission_no = COALESCE($2, admission_no),
         state_student_id = COALESCE($3, state_student_id),
         medium_id = COALESCE($4, medium_id),
         mother_tongue = COALESCE($5, mother_tongue),
         language_subject_choice = COALESCE($6, language_subject_choice),
         community_category = COALESCE($7, community_category),
         is_first_gen_learner = COALESCE($8, is_first_gen_learner),
         is_differently_abled = COALESCE($9, is_differently_abled),
         support_needs = COALESCE($10, support_needs),
         blood_group = COALESCE($11, blood_group),
         is_hosteller = COALESCE($12, is_hosteller),
         uses_school_transport = COALESCE($13, uses_school_transport),
         bank_account_ref = COALESCE($14, bank_account_ref),
         commute_mode = COALESCE($15, commute_mode),
         updated_at = now()
       WHERE id = $1
       RETURNING id`,
      [
        id,
        input.admissionNo ?? null,
        input.stateStudentId ?? null,
        input.mediumId ?? null,
        input.motherTongue ?? null,
        input.languageSubjectChoice ?? null,
        input.communityCategory ?? null,
        input.isFirstGenLearner ?? null,
        input.isDifferentlyAbled ?? null,
        input.supportNeeds ?? null,
        input.bloodGroup ?? null,
        input.isHosteller ?? null,
        input.usesSchoolTransport ?? null,
        input.bankAccountRef ?? null,
        input.commuteMode ?? null,
      ],
    );
    if (rows.length === 0) return null;
    return this.findById(id, executor);
  }

  /** Atomic: status and date_of_leaving must change together, per student_leaving_consistent
   * (status IN (LEFT,TC_ISSUED,ARCHIVED) <=> date_of_leaving IS NOT NULL). */
  async leave(
    id: string,
    status: string,
    dateOfLeaving: string,
    executor: Queryable = this.postgres,
  ): Promise<StudentRow | null> {
    const { rows } = await executor.query<{ id: string }>(
      `UPDATE student SET status = $2, date_of_leaving = $3, updated_at = now()
       WHERE id = $1
       RETURNING id`,
      [id, status, dateOfLeaving],
    );
    if (rows.length === 0) return null;
    return this.findById(id, executor);
  }
}
