// Academic Coordinator's own Class Timetable editor -- reuses the exact same
// real timetable_period/timetable_slot tables the already-shipped read-only
// Faculty Timetable screen reads (see ../repositories/timetable.repository.ts),
// plus one new additive column (is_draft, migration 0010) so an in-progress
// edit never shows to a real teacher until explicitly published. The DB's own
// existing trg_slot_clash trigger (check_teacher_slot_clash()) is what
// actually enforces "no teacher double-booked" -- this repository never
// re-implements that check, it just surfaces the constraint violation.

import { ConflictException, Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface CoordinatorTimetableSlotRow {
  slotId: string;
  periodId: string;
  periodNo: number;
  startTime: string;
  endTime: string;
  dayOfWeek: number;
  room: string | null;
  isDraft: boolean;
  subjectOfferingId: string;
  subjectName: string;
  teacherName: string | null;
}

@Injectable()
export class AcademicCoordinatorTimetableRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findPeriodsForStage(stage: string, executor: Queryable = this.postgres) {
    const { rows } = await executor.query(
      `SELECT id, period_no, label, start_time, end_time, is_break
       FROM timetable_period
       WHERE applies_to_stage = $1 OR applies_to_stage IS NULL
       ORDER BY period_no`,
      [stage],
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

  async findSlotsForSection(sectionId: string, executor: Queryable = this.postgres): Promise<CoordinatorTimetableSlotRow[]> {
    const { rows } = await executor.query(
      `SELECT ts.id AS slot_id, ts.period_id, tp.period_no, tp.start_time, tp.end_time, ts.day_of_week, ts.room, ts.is_draft,
              ts.subject_offering_id, subj.name AS subject_name,
              (p.first_name || COALESCE(' ' || p.last_name, '')) AS teacher_name
       FROM timetable_slot ts
       JOIN timetable_period tp ON tp.id = ts.period_id
       JOIN subject_offering so ON so.id = ts.subject_offering_id
       JOIN subject subj ON subj.id = so.subject_id
       LEFT JOIN staff st ON st.id = so.teacher_staff_id AND st.status = 'ACTIVE'
       LEFT JOIN person p ON p.id = st.person_id
       WHERE so.section_id = $1 AND ts.status = 'ACTIVE'
       ORDER BY ts.day_of_week, tp.period_no`,
      [sectionId],
    );
    return rows.map((r: any) => ({
      slotId: r.slot_id,
      periodId: r.period_id,
      periodNo: r.period_no,
      startTime: r.start_time,
      endTime: r.end_time,
      dayOfWeek: r.day_of_week,
      room: r.room,
      isDraft: r.is_draft,
      subjectOfferingId: r.subject_offering_id,
      subjectName: r.subject_name,
      teacherName: r.teacher_name,
    }));
  }

  /** Sets one section's (day, period) cell to the given subject_offering --
   * cancels whatever ACTIVE slot currently occupies that exact cell (any
   * subject_offering) first, then inserts the new one as a draft. Runs both
   * halves in one transaction so a mid-way failure (e.g. the DB's own
   * teacher-clash trigger rejecting the insert) never leaves the cell empty. */
  async upsertDraftSlot(
    input: { sectionId: string; dayOfWeek: number; periodId: string; subjectOfferingId: string; room?: string | null },
  ): Promise<string> {
    const client = await this.postgres.connect();
    try {
      await client.query('BEGIN');
      const { rows: existing } = await client.query(
        `SELECT ts.id FROM timetable_slot ts
         JOIN subject_offering so ON so.id = ts.subject_offering_id
         WHERE so.section_id = $1 AND ts.day_of_week = $2 AND ts.period_id = $3 AND ts.status = 'ACTIVE'`,
        [input.sectionId, input.dayOfWeek, input.periodId],
      );
      for (const row of existing) {
        await client.query(`UPDATE timetable_slot SET status = 'CANCELLED', updated_at = now() WHERE id = $1`, [row.id]);
      }
      let newId: string;
      try {
        const { rows } = await client.query(
          `INSERT INTO timetable_slot (subject_offering_id, period_id, day_of_week, room, status, is_draft)
           VALUES ($1, $2, $3, $4, 'ACTIVE', true) RETURNING id`,
          [input.subjectOfferingId, input.periodId, input.dayOfWeek, input.room ?? null],
        );
        newId = rows[0].id;
      } catch (err) {
        await client.query('ROLLBACK');
        if (isTeacherClash(err)) {
          throw new ConflictException('This teacher already has another class scheduled at that day and period.');
        }
        throw err;
      }
      await client.query('COMMIT');
      return newId;
    } finally {
      client.release();
    }
  }

  async deleteDraftSlot(slotId: string, executor: Queryable = this.postgres): Promise<boolean> {
    const { rowCount } = await executor.query(`DELETE FROM timetable_slot WHERE id = $1 AND is_draft = true`, [slotId]);
    return (rowCount ?? 0) > 0;
  }

  async findSlotSectionId(slotId: string, executor: Queryable = this.postgres): Promise<string | null> {
    const { rows } = await executor.query(
      `SELECT so.section_id FROM timetable_slot ts JOIN subject_offering so ON so.id = ts.subject_offering_id WHERE ts.id = $1`,
      [slotId],
    );
    return rows[0]?.section_id ?? null;
  }

  async publishSectionDrafts(sectionId: string, executor: Queryable = this.postgres): Promise<number> {
    const { rowCount } = await executor.query(
      `UPDATE timetable_slot SET is_draft = false, updated_at = now()
       WHERE is_draft = true AND subject_offering_id IN (SELECT id FROM subject_offering WHERE section_id = $1)`,
      [sectionId],
    );
    return rowCount ?? 0;
  }
}

function isTeacherClash(err: unknown): boolean {
  // Exact text raised by the DB's own trg_slot_clash / check_teacher_slot_clash()
  // trigger -- see database function definition, never re-derive it here.
  return typeof err === 'object' && err !== null && 'message' in err && typeof (err as { message: unknown }).message === 'string'
    ? /already has a class/i.test((err as { message: string }).message)
    : false;
}
