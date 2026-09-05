import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../infrastructure/postgres/postgres.service';

export interface CalendarEventRow {
  id: string;
  academicYearId: string;
  title: string;
  description: string | null;
  eventType: string;
  isHoliday: boolean;
  startDate: string;
  endDate: string;
  scopeType: string;
  scopeId: string | null;
  scopeStage: string | null;
  createdBy: string;
}

export interface CreateCalendarEventInput {
  academicYearId: string;
  title: string;
  description?: string | null;
  eventType: string;
  isHoliday?: boolean;
  startDate: string;
  endDate: string;
  scopeType: string;
  scopeId?: string | null;
  scopeStage?: string | null;
  createdBy: string;
}

export interface CalendarEventFilter {
  academicYearId?: string;
  from?: string;
  to?: string;
}

const COLUMNS = `id, academic_year_id AS "academicYearId", title, description,
  event_type AS "eventType", is_holiday AS "isHoliday",
  start_date AS "startDate", end_date AS "endDate",
  scope_type AS "scopeType", scope_id AS "scopeId", scope_stage AS "scopeStage",
  created_by AS "createdBy"`;

@Injectable()
export class CalendarEventRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(filter: CalendarEventFilter, executor: Queryable = this.postgres): Promise<CalendarEventRow[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.academicYearId) {
      params.push(filter.academicYearId);
      conditions.push(`academic_year_id = $${params.length}`);
    }
    if (filter.from) {
      params.push(filter.from);
      conditions.push(`end_date >= $${params.length}`);
    }
    if (filter.to) {
      params.push(filter.to);
      conditions.push(`start_date <= $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await executor.query<CalendarEventRow>(
      `SELECT ${COLUMNS} FROM calendar_event ${where} ORDER BY start_date`,
      params,
    );
    return rows;
  }

  async findById(id: string, executor: Queryable = this.postgres): Promise<CalendarEventRow | null> {
    const { rows } = await executor.query<CalendarEventRow>(
      `SELECT ${COLUMNS} FROM calendar_event WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(input: CreateCalendarEventInput, executor: Queryable = this.postgres): Promise<CalendarEventRow> {
    const { rows } = await executor.query<CalendarEventRow>(
      `INSERT INTO calendar_event
         (academic_year_id, title, description, event_type, is_holiday, start_date, end_date,
          scope_type, scope_id, scope_stage, created_by)
       VALUES ($1, $2, $3, $4, COALESCE($5, false), $6, $7, $8, $9, $10, $11)
       RETURNING ${COLUMNS}`,
      [
        input.academicYearId,
        input.title,
        input.description ?? null,
        input.eventType,
        input.isHoliday ?? null,
        input.startDate,
        input.endDate,
        input.scopeType,
        input.scopeId ?? null,
        input.scopeStage ?? null,
        input.createdBy,
      ],
    );
    return rows[0];
  }

  async delete(id: string, executor: Queryable = this.postgres): Promise<boolean> {
    const { rowCount } = await executor.query(`DELETE FROM calendar_event WHERE id = $1`, [id]);
    return (rowCount ?? 0) > 0;
  }
}
