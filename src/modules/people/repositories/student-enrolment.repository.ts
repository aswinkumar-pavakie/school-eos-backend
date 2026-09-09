import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface StudentEnrolmentRow {
  id: string;
  studentId: string;
  academicYearId: string;
  sectionId: string;
  rollNo: number | null;
  enrolmentType: string;
  outcome: string | null;
  enrolledOn: string;
  status: string;
  remarks: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateEnrolmentInput {
  studentId: string;
  academicYearId: string;
  sectionId: string;
  rollNo?: number | null;
  enrolmentType?: string;
  remarks?: string | null;
}

export interface UpdateEnrolmentInput {
  sectionId?: string;
  rollNo?: number | null;
  status?: string;
  outcome?: string | null;
  remarks?: string | null;
}

const COLUMNS = `id, student_id AS "studentId", academic_year_id AS "academicYearId",
  section_id AS "sectionId", roll_no AS "rollNo", enrolment_type AS "enrolmentType", outcome,
  enrolled_on AS "enrolledOn", status, remarks, created_at AS "createdAt", updated_at AS "updatedAt"`;

@Injectable()
export class StudentEnrolmentRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findByStudentId(
    studentId: string,
    executor: Queryable = this.postgres,
  ): Promise<StudentEnrolmentRow[]> {
    const { rows } = await executor.query<StudentEnrolmentRow>(
      `SELECT ${COLUMNS} FROM student_enrolment WHERE student_id = $1 ORDER BY enrolled_on DESC`,
      [studentId],
    );
    return rows;
  }

  async findByStudentAndYear(
    studentId: string,
    academicYearId: string,
    executor: Queryable = this.postgres,
  ): Promise<StudentEnrolmentRow | null> {
    const { rows } = await executor.query<StudentEnrolmentRow>(
      `SELECT ${COLUMNS} FROM student_enrolment WHERE student_id = $1 AND academic_year_id = $2`,
      [studentId, academicYearId],
    );
    return rows[0] ?? null;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<StudentEnrolmentRow | null> {
    const { rows } = await executor.query<StudentEnrolmentRow>(
      `SELECT ${COLUMNS} FROM student_enrolment WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  /** Next free roll number in this section for this academic year -- MAX+1,
   * defaulting to 1 for the section's first enrolment. Used when the admin
   * doesn't type one in, so roll numbers assign themselves in admission order
   * instead of needing to be tracked by hand. */
  async nextRollNo(
    sectionId: string,
    academicYearId: string,
    executor: Queryable = this.postgres,
  ): Promise<number> {
    const { rows } = await executor.query<{ next: number }>(
      `SELECT COALESCE(MAX(roll_no), 0) + 1 AS next
       FROM student_enrolment
       WHERE section_id = $1 AND academic_year_id = $2`,
      [sectionId, academicYearId],
    );
    return rows[0].next;
  }

  async create(
    input: CreateEnrolmentInput,
    executor: Queryable = this.postgres,
  ): Promise<StudentEnrolmentRow> {
    const { rows } = await executor.query<StudentEnrolmentRow>(
      `INSERT INTO student_enrolment (student_id, academic_year_id, section_id, roll_no, enrolment_type, remarks)
       VALUES ($1, $2, $3, $4, COALESCE($5, 'REGULAR'), $6)
       RETURNING ${COLUMNS}`,
      [
        input.studentId,
        input.academicYearId,
        input.sectionId,
        input.rollNo ?? null,
        input.enrolmentType ?? null,
        input.remarks ?? null,
      ],
    );
    return rows[0];
  }

  /** Plain field edit (roll no / status / outcome / remarks) on the existing row --
   * never changes section_id (that's transferSection's job, via supersede()+create(),
   * so the previous section is kept as real history instead of overwritten). */
  async update(
    id: string,
    input: UpdateEnrolmentInput,
    executor: Queryable = this.postgres,
  ): Promise<StudentEnrolmentRow | null> {
    const { rows } = await executor.query<StudentEnrolmentRow>(
      `UPDATE student_enrolment SET
         roll_no = COALESCE($2, roll_no),
         status = COALESCE($3, status),
         outcome = COALESCE($4, outcome),
         remarks = COALESCE($5, remarks),
         updated_at = now()
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [
        id,
        input.rollNo ?? null,
        input.status ?? null,
        input.outcome ?? null,
        input.remarks ?? null,
      ],
    );
    return rows[0] ?? null;
  }

  /** Locks the row for a transfer -- pairs with create() inside the same
   * transaction (see EnrolmentsService.transferSection) so two concurrent
   * transfer attempts on the same enrolment can't both pass the "is it still
   * ACTIVE" check. */
  async findByIdForUpdate(
    id: string,
    executor: Queryable,
  ): Promise<StudentEnrolmentRow | null> {
    const { rows } = await executor.query<StudentEnrolmentRow>(
      `SELECT ${COLUMNS} FROM student_enrolment WHERE id = $1 FOR UPDATE`,
      [id],
    );
    return rows[0] ?? null;
  }

  /** Marks a row as superseded by a section transfer -- the section_id/roll_no it
   * had are frozen here as real history, never overwritten. Only the partial unique
   * index (student_id, academic_year_id) WHERE status='ACTIVE' lets a new ACTIVE row
   * for the same year coexist with this once it's no longer ACTIVE. */
  async supersede(
    id: string,
    remarks: string | null,
    executor: Queryable,
  ): Promise<StudentEnrolmentRow | null> {
    const { rows } = await executor.query<StudentEnrolmentRow>(
      `UPDATE student_enrolment SET
         status = 'TRANSFERRED_SECTION',
         remarks = COALESCE($2, remarks),
         updated_at = now()
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [id, remarks ?? null],
    );
    return rows[0] ?? null;
  }

  async delete(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<boolean> {
    const { rowCount } = await executor.query(
      `DELETE FROM student_enrolment WHERE id = $1`,
      [id],
    );
    return (rowCount ?? 0) > 0;
  }
}
