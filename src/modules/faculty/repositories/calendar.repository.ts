// Real calendar_event table (12 real rows already seeded) -- Faculty sees
// every SCHOOL-wide event plus any STAGE-scoped event matching a stage they
// actually teach or advise in (derived from their own real grade/section
// scope, not a client-supplied filter).

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface CalendarEventRow {
  id: string;
  title: string;
  description: string | null;
  eventType: string;
  isHoliday: boolean;
  startDate: string;
  endDate: string;
  scopeType: string;
  scopeStage: string | null;
}

export interface CurrentAcademicYearRow {
  name: string;
  startDate: string;
  endDate: string;
}

@Injectable()
export class CalendarRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** The real current academic_year's own name + date range -- the
   * Calendar screen's header subtitle reads this instead of a fabricated
   * "Semester" label, since no semester/term table exists in this schema. */
  async findCurrentAcademicYear(executor: Queryable = this.postgres): Promise<CurrentAcademicYearRow | null> {
    const { rows } = await executor.query(`SELECT name, start_date, end_date FROM academic_year WHERE is_current LIMIT 1`);
    if (!rows[0]) return null;
    return { name: rows[0].name, startDate: rows[0].start_date, endDate: rows[0].end_date };
  }

  async findForStages(stages: string[], executor: Queryable = this.postgres): Promise<CalendarEventRow[]> {
    const { rows } = await executor.query(
      `SELECT id, title, description, event_type, is_holiday, start_date, end_date, scope_type, scope_stage
       FROM calendar_event
       WHERE academic_year_id = (SELECT id FROM academic_year WHERE is_current LIMIT 1)
         AND (scope_type = 'SCHOOL' OR (scope_type = 'STAGE' AND scope_stage = ANY($1)))
       ORDER BY start_date`,
      [stages],
    );
    return rows.map(mapEvent);
  }

  // ============================================================
  // Academic Coordinator's own create/edit/delete -- additive to this same
  // repository (not a new one) since it's still exactly "the real
  // calendar_event table", just written instead of only read. Always
  // STAGE-scoped to the coordinator's own stage -- never SCHOOL-wide, which
  // stays Admin/Principal's own call.
  // ============================================================

  async findById(id: string, executor: Queryable = this.postgres): Promise<CalendarEventRow | null> {
    const { rows } = await executor.query(
      `SELECT id, title, description, event_type, is_holiday, start_date, end_date, scope_type, scope_stage, created_by
       FROM calendar_event WHERE id = $1`,
      [id],
    );
    return rows[0] ? mapEvent(rows[0]) : null;
  }

  async create(
    input: {
      academicYearId: string;
      title: string;
      description?: string | null;
      eventType: string;
      isHoliday?: boolean;
      startDate: string;
      endDate: string;
      scopeStage: string;
      createdBy: string;
    },
    executor: Queryable = this.postgres,
  ): Promise<string> {
    const { rows } = await executor.query(
      `INSERT INTO calendar_event (academic_year_id, title, description, event_type, is_holiday, start_date, end_date, scope_type, scope_stage, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'STAGE',$8,$9) RETURNING id`,
      [
        input.academicYearId,
        input.title,
        input.description ?? null,
        input.eventType,
        input.isHoliday ?? false,
        input.startDate,
        input.endDate,
        input.scopeStage,
        input.createdBy,
      ],
    );
    return rows[0].id;
  }

  async update(
    id: string,
    input: Partial<{ title: string; description: string; eventType: string; isHoliday: boolean; startDate: string; endDate: string }>,
    executor: Queryable = this.postgres,
  ): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [id];
    const push = (col: string, val: unknown) => {
      if (val === undefined) return;
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };
    push('title', input.title);
    push('description', input.description);
    push('event_type', input.eventType);
    push('is_holiday', input.isHoliday);
    push('start_date', input.startDate);
    push('end_date', input.endDate);
    if (sets.length === 0) return;
    await executor.query(`UPDATE calendar_event SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, params);
  }

  async delete(id: string, executor: Queryable = this.postgres): Promise<void> {
    await executor.query(`DELETE FROM calendar_event WHERE id = $1`, [id]);
  }
}

function mapEvent(r: any): CalendarEventRow {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    eventType: r.event_type,
    isHoliday: r.is_holiday,
    startDate: r.start_date,
    endDate: r.end_date,
    scopeType: r.scope_type,
    scopeStage: r.scope_stage,
  };
}
