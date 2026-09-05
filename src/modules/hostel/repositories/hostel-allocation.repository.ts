import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface HostelAllocationRow {
  id: string;
  studentId: string;
  studentFirstName: string;
  studentLastName: string | null;
  admissionNo: string;
  bedId: string;
  bedNo: string;
  roomNo: string;
  hostelName: string;
  academicYearId: string;
  allocatedFrom: string;
  allocatedTo: string | null;
  allocatedBy: string | null;
  status: string;
}

export interface CreateHostelAllocationInput {
  studentId: string;
  bedId: string;
  academicYearId: string;
  allocatedFrom: string;
  allocatedBy?: string | null;
}

export interface HostelAllocationFilter {
  studentId?: string;
  bedId?: string;
  academicYearId?: string;
  status?: string;
}

export interface UnallocatedHostelStudentRow {
  id: string;
  firstName: string;
  lastName: string | null;
  admissionNo: string;
  gradeName: string | null;
  sectionName: string | null;
  gender: string | null;
}

const COLUMNS = `a.id, a.student_id AS "studentId", p.first_name AS "studentFirstName",
  p.last_name AS "studentLastName", s.admission_no AS "admissionNo",
  a.bed_id AS "bedId", bed.bed_no AS "bedNo", r.room_no AS "roomNo", h.name AS "hostelName",
  a.academic_year_id AS "academicYearId",
  a.allocated_from AS "allocatedFrom", a.allocated_to AS "allocatedTo",
  a.allocated_by AS "allocatedBy", a.status`;

const FROM = `hostel_allocation a
  JOIN student s ON s.id = a.student_id
  JOIN person p ON p.id = s.person_id
  JOIN hostel_bed bed ON bed.id = a.bed_id
  JOIN hostel_room r ON r.id = bed.room_id
  JOIN hostel_floor f ON f.id = r.floor_id
  JOIN hostel_block bl ON bl.id = f.block_id
  JOIN hostel h ON h.id = bl.hostel_id`;

@Injectable()
export class HostelAllocationRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(
    filter: HostelAllocationFilter,
    executor: Queryable = this.postgres,
  ): Promise<HostelAllocationRow[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter.studentId) {
      params.push(filter.studentId);
      conditions.push(`a.student_id = $${params.length}`);
    }
    if (filter.bedId) {
      params.push(filter.bedId);
      conditions.push(`a.bed_id = $${params.length}`);
    }
    if (filter.academicYearId) {
      params.push(filter.academicYearId);
      conditions.push(`a.academic_year_id = $${params.length}`);
    }
    if (filter.status) {
      params.push(filter.status);
      conditions.push(`a.status = $${params.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await executor.query<HostelAllocationRow>(
      `SELECT ${COLUMNS} FROM ${FROM} ${where} ORDER BY a.allocated_from DESC`,
      params,
    );
    return rows;
  }

  /** Students marked as hostellers (student.is_hosteller) who have no ACTIVE
   * hostel_allocation for the given academic year yet -- the "still needs a bed"
   * list the room-allocation board's drag source is built from. */
  async findUnallocatedForYear(
    academicYearId: string,
    executor: Queryable = this.postgres,
  ): Promise<UnallocatedHostelStudentRow[]> {
    const { rows } = await executor.query<UnallocatedHostelStudentRow>(
      `SELECT s.id, p.first_name AS "firstName", p.last_name AS "lastName", s.admission_no AS "admissionNo",
              g.name AS "gradeName", sec.name AS "sectionName", p.gender AS "gender"
       FROM student s
       JOIN person p ON p.id = s.person_id
       LEFT JOIN student_enrolment se ON se.student_id = s.id AND se.status = 'ACTIVE'
         AND se.academic_year_id = $1
       LEFT JOIN section sec ON sec.id = se.section_id
       LEFT JOIN grade g ON g.id = sec.grade_id
       WHERE s.is_hosteller = true
         AND s.status = 'ACTIVE'
         AND NOT EXISTS (
           SELECT 1 FROM hostel_allocation ha
           WHERE ha.student_id = s.id AND ha.academic_year_id = $1 AND ha.status = 'ACTIVE'
         )
       ORDER BY p.first_name, p.last_name`,
      [academicYearId],
    );
    return rows;
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<HostelAllocationRow | null> {
    const { rows } = await executor.query<HostelAllocationRow>(
      `SELECT ${COLUMNS} FROM ${FROM} WHERE a.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    input: CreateHostelAllocationInput,
    executor: Queryable,
  ): Promise<HostelAllocationRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO hostel_allocation (student_id, bed_id, academic_year_id, allocated_from, allocated_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [input.studentId, input.bedId, input.academicYearId, input.allocatedFrom, input.allocatedBy ?? null],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  async vacate(
    id: string,
    allocatedTo: string,
    executor: Queryable,
  ): Promise<HostelAllocationRow | null> {
    const { rows } = await executor.query<{ id: string }>(
      `UPDATE hostel_allocation SET status = 'VACATED', allocated_to = $2
       WHERE id = $1
       RETURNING id`,
      [id, allocatedTo],
    );
    if (rows.length === 0) return null;
    return this.findById(id, executor);
  }
}
