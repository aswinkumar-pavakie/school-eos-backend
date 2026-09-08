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
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CalendarEventListFilter {
  academicYearId?: string;
  fromDate?: string;
  toDate?: string;
}

export interface CreateCalendarEventInput {
  academicYearId: string;
  title: string;
  description?: string | null;
  eventType: string;
  isHoliday?: boolean;
  startDate: string;
  endDate: string;
  scopeType?: string;
  scopeId?: string | null;
  scopeStage?: string | null;
  createdBy?: string | null;
}

export interface UpdateCalendarEventInput {
  title?: string;
  description?: string | null;
  eventType?: string;
  isHoliday?: boolean;
  startDate?: string;
  endDate?: string;
  scopeType?: string;
  scopeId?: string | null;
  scopeStage?: string | null;
}

const COLUMNS = `id, academic_year_id AS "academicYearId", title, description, event_type AS "eventType",
  is_holiday AS "isHoliday", start_date AS "startDate", end_date AS "endDate", scope_type AS "scopeType",
  scope_id AS "scopeId", scope_stage AS "scopeStage", created_by AS "createdBy",
  created_at AS "createdAt", updated_at AS "updatedAt"`;

@Injectable()
export class CalendarEventRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(
    filter: CalendarEventListFilter,
    executor: Queryable = this.postgres,
  ): Promise<CalendarEventRow[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.academicYearId) {
      params.push(filter.academicYearId);
      conditions.push(`academic_year_id = $${params.length}`);
    }
    if (filter.fromDate) {
      params.push(filter.fromDate);
      conditions.push(`end_date >= $${params.length}`);
    }
    if (filter.toDate) {
      params.push(filter.toDate);
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

  async create(
    input: CreateCalendarEventInput,
    executor: Queryable = this.postgres,
  ): Promise<CalendarEventRow> {
    const { rows } = await executor.query<CalendarEventRow>(
      `INSERT INTO calendar_event
         (academic_year_id, title, description, event_type, is_holiday, start_date, end_date,
          scope_type, scope_id, scope_stage, created_by)
       VALUES ($1, $2, $3, $4, COALESCE($5, false), $6, $7, COALESCE($8, 'SCHOOL'), $9, $10, $11)
       RETURNING ${COLUMNS}`,
      [
        input.academicYearId,
        input.title,
        input.description ?? null,
        input.eventType,
        input.isHoliday ?? null,
        input.startDate,
        input.endDate,
        input.scopeType ?? null,
        input.scopeId ?? null,
        input.scopeStage ?? null,
        input.createdBy ?? null,
      ],
    );
    return rows[0];
  }

  async update(
    id: string,
    input: UpdateCalendarEventInput,
    executor: Queryable = this.postgres,
  ): Promise<CalendarEventRow | null> {
    const { rows } = await executor.query<CalendarEventRow>(
      `UPDATE calendar_event SET
         title = COALESCE($2, title),
         description = COALESCE($3, description),
         event_type = COALESCE($4, event_type),
         is_holiday = COALESCE($5, is_holiday),
         start_date = COALESCE($6, start_date),
         end_date = COALESCE($7, end_date),
         scope_type = COALESCE($8, scope_type),
         scope_id = COALESCE($9, scope_id),
         scope_stage = COALESCE($10, scope_stage),
         updated_at = now()
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [
        id,
        input.title ?? null,
        input.description ?? null,
        input.eventType ?? null,
        input.isHoliday ?? null,
        input.startDate ?? null,
        input.endDate ?? null,
        input.scopeType ?? null,
        input.scopeId ?? null,
        input.scopeStage ?? null,
      ],
    );
    return rows[0] ?? null;
  }

  async delete(id: string, executor: Queryable = this.postgres): Promise<boolean> {
    const { rowCount } = await executor.query(`DELETE FROM calendar_event WHERE id = $1`, [id]);
    return (rowCount ?? 0) > 0;
  }
}
