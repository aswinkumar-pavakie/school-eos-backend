import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface TimetablePeriodRow {
  id: string;
  periodNo: number;
  label: string;
  startTime: string;
  endTime: string;
  appliesToStage: string | null;
  isBreak: boolean;
}

export interface TimetableSlotRow {
  id: string;
  dayOfWeek: number;
  room: string | null;
  periodId: string;
  periodNo: number;
  periodLabel: string;
  startTime: string;
  endTime: string;
  sectionId: string;
  sectionName: string;
  gradeName: string;
  subjectId: string;
  subjectName: string;
  teacherStaffId: string;
  teacherFirstName: string;
  teacherLastName: string | null;
}

const SLOT_COLUMNS = `ts.id, ts.day_of_week AS "dayOfWeek", ts.room,
  tp.id AS "periodId", tp.period_no AS "periodNo", tp.label AS "periodLabel",
  tp.start_time AS "startTime", tp.end_time AS "endTime",
  so.section_id AS "sectionId", sec.name AS "sectionName", g.name AS "gradeName",
  so.subject_id AS "subjectId", subj.name AS "subjectName",
  so.teacher_staff_id AS "teacherStaffId", p.first_name AS "teacherFirstName", p.last_name AS "teacherLastName"`;

const SLOT_JOINS = `FROM timetable_slot ts
  JOIN subject_offering so ON so.id = ts.subject_offering_id
  JOIN timetable_period tp ON tp.id = ts.period_id
  JOIN section sec ON sec.id = so.section_id
  JOIN grade g ON g.id = sec.grade_id
  JOIN subject subj ON subj.id = so.subject_id
  JOIN staff st ON st.id = so.teacher_staff_id
  JOIN person p ON p.id = st.person_id`;

@Injectable()
export class TimetableRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findPeriods(
    executor: Queryable = this.postgres,
  ): Promise<TimetablePeriodRow[]> {
    const { rows } = await executor.query<TimetablePeriodRow>(
      `SELECT id, period_no AS "periodNo", label, start_time AS "startTime", end_time AS "endTime",
              applies_to_stage AS "appliesToStage", is_break AS "isBreak"
       FROM timetable_period
       ORDER BY period_no`,
    );
    return rows;
  }

  async findBySection(
    sectionId: string,
    executor: Queryable = this.postgres,
  ): Promise<TimetableSlotRow[]> {
    const { rows } = await executor.query<TimetableSlotRow>(
      `SELECT ${SLOT_COLUMNS} ${SLOT_JOINS}
       WHERE so.section_id = $1 AND ts.status = 'ACTIVE'
       ORDER BY ts.day_of_week, tp.period_no`,
      [sectionId],
    );
    return rows;
  }

  async findByTeacher(
    teacherStaffId: string,
    executor: Queryable = this.postgres,
  ): Promise<TimetableSlotRow[]> {
    const { rows } = await executor.query<TimetableSlotRow>(
      `SELECT ${SLOT_COLUMNS} ${SLOT_JOINS}
       WHERE so.teacher_staff_id = $1 AND ts.status = 'ACTIVE'
       ORDER BY ts.day_of_week, tp.period_no`,
      [teacherStaffId],
    );
    return rows;
  }
}
