// Real timetable_slot/timetable_period tables (1666 real slots already
// seeded) -- Faculty's own weekly timetable is just every real slot across
// every one of their own real subject_offering rows, joined to its period's
// real day/time. No new schema needed.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface TimetablePeriod {
  periodId: string;
  periodNo: number;
  label: string | null;
  startTime: string;
  endTime: string;
  isBreak: boolean;
}

export interface TimetableSlot {
  slotId: string;
  periodId: string;
  periodNo: number;
  startTime: string;
  endTime: string;
  dayOfWeek: number;
  room: string | null;
  subjectOfferingId: string;
  subjectName: string;
  gradeName: string;
  sectionName: string;
  isPractical: boolean;
}

@Injectable()
export class TimetableRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** Every real period definition (the grid's own row headers), including
   * breaks -- shown in the grid so a free period reads as "free", not just
   * a gap. */
  async findAllPeriods(
    executor: Queryable = this.postgres,
  ): Promise<TimetablePeriod[]> {
    const { rows } = await executor.query(
      `SELECT id, period_no, label, start_time, end_time, is_break
       FROM timetable_period ORDER BY period_no`,
    );
    return rows.map((r: any) => ({
      periodId: r.id,
      periodNo: r.period_no,
      label: r.label,
      startTime: r.start_time,
      endTime: r.end_time,
      isBreak: r.is_break,
    }));
  }

  /** Every real, ACTIVE, PUBLISHED slot across this teacher's own
   * subject_offerings. `is_draft` (migration 0010) defaults false for every
   * one of the 1666 rows that existed before Academic Coordinator's own
   * draft-then-publish editor -- this filter changes nothing for any of
   * them, it only ever hides a coordinator's still-in-progress edit. */
  async findSlotsForOfferings(
    subjectOfferingIds: string[],
    executor: Queryable = this.postgres,
  ): Promise<TimetableSlot[]> {
    if (subjectOfferingIds.length === 0) return [];
    const { rows } = await executor.query(
      `SELECT ts.id AS slot_id, ts.period_id, tp.period_no, tp.start_time, tp.end_time, ts.day_of_week, ts.room,
              ts.subject_offering_id, subj.name AS subject_name, g.name AS grade_name, sec.name AS section_name,
              so.is_practical
       FROM timetable_slot ts
       JOIN timetable_period tp ON tp.id = ts.period_id
       JOIN subject_offering so ON so.id = ts.subject_offering_id
       JOIN subject subj ON subj.id = so.subject_id
       JOIN section sec ON sec.id = so.section_id
       JOIN grade g ON g.id = sec.grade_id
       WHERE ts.subject_offering_id = ANY($1) AND ts.status = 'ACTIVE' AND ts.is_draft = false
       ORDER BY ts.day_of_week, tp.period_no`,
      [subjectOfferingIds],
    );
    return rows.map((r: any) => ({
      slotId: r.slot_id,
      periodId: r.period_id,
      periodNo: r.period_no,
      startTime: r.start_time,
      endTime: r.end_time,
      dayOfWeek: r.day_of_week,
      room: r.room,
      subjectOfferingId: r.subject_offering_id,
      subjectName: r.subject_name,
      gradeName: r.grade_name,
      sectionName: r.section_name,
      isPractical: r.is_practical,
    }));
  }
}
