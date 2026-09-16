// Real, already-populated `substitution` table (20 real rows at the time
// this was wired up) -- confirmed completely unused anywhere else in this
// backend before this. Records which real teacher covers which real
// timetable_slot on a given real date, for a teacher who is genuinely
// absent (see staff-leave-request.repository.ts's own
// findApprovedForDateAndStaff for the real absence signal this pairs
// with).

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface SubstitutionRow {
  id: string;
  timetableSlotId: string;
  subDate: string;
  originalStaffId: string;
  substituteStaffId: string;
  reason: string | null;
  assignedBy: string;
  status: string;
}

function mapRow(row: any): SubstitutionRow {
  return {
    id: row.id,
    timetableSlotId: row.timetable_slot_id,
    subDate: row.sub_date,
    originalStaffId: row.original_staff_id,
    substituteStaffId: row.substitute_staff_id,
    reason: row.reason,
    assignedBy: row.assigned_by,
    status: row.status,
  };
}

@Injectable()
export class SubstitutionRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findForDateAndStaff(
    originalStaffIds: string[],
    subDate: string,
    executor: Queryable = this.postgres,
  ): Promise<SubstitutionRow[]> {
    if (originalStaffIds.length === 0) return [];
    const { rows } = await executor.query(
      `SELECT id, timetable_slot_id, sub_date, original_staff_id, substitute_staff_id, reason, assigned_by, status
       FROM substitution
       WHERE original_staff_id = ANY($1) AND sub_date = $2`,
      [originalStaffIds, subDate],
    );
    return rows.map(mapRow);
  }

  /** One real substitution per (timetable_slot, date) -- re-assigning the
   * same gap replaces the previous assignment rather than stacking a
   * second row (a period only ever has one real cover teacher on a given
   * day). */
  async upsert(
    input: {
      timetableSlotId: string;
      subDate: string;
      originalStaffId: string;
      substituteStaffId: string;
      reason: string | null;
      assignedBy: string;
    },
    executor: Queryable = this.postgres,
  ): Promise<string> {
    const { rows } = await executor.query(
      `INSERT INTO substitution (timetable_slot_id, sub_date, original_staff_id, substitute_staff_id, reason, assigned_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'ASSIGNED')
       ON CONFLICT (timetable_slot_id, sub_date)
       DO UPDATE SET substitute_staff_id = $4, reason = $5, assigned_by = $6, status = 'ASSIGNED', updated_at = now()
       RETURNING id`,
      [
        input.timetableSlotId,
        input.subDate,
        input.originalStaffId,
        input.substituteStaffId,
        input.reason,
        input.assignedBy,
      ],
    );
    return rows[0].id;
  }
}
