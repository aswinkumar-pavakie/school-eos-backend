// Read + a single narrow write (acknowledge) over the real, already-seeded
// transport_alert table -- zero other NestJS code touches it yet. No alert
// creation here: alerts are raised by whatever process populates this table
// today (the seed data's own "Auto-generated telemetry alert" rows); this
// phase only reads them and lets a Transport Manager acknowledge one.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface TransportAlertFilter {
  acknowledged?: boolean;
  severity?: string;
  vehicleId?: string;
  limit: number;
  offset: number;
}

export interface TransportAlertRow {
  id: string;
  tripId: string | null;
  vehicleId: string | null;
  registrationNo: string | null;
  studentId: string | null;
  studentFirstName: string | null;
  studentLastName: string | null;
  alertType: string;
  severity: string;
  raisedAt: Date;
  detail: Record<string, unknown> | null;
  acknowledgedBy: string | null;
  acknowledgedAt: Date | null;
  resolvedAt: Date | null;
}

const FROM = `
  FROM transport_alert ta
  LEFT JOIN vehicle v ON v.id = ta.vehicle_id
  LEFT JOIN student s ON s.id = ta.student_id
  LEFT JOIN person p ON p.id = s.person_id`;

const COLUMNS = `ta.id::text AS id, ta.trip_id AS "tripId", ta.vehicle_id AS "vehicleId",
  v.registration_no AS "registrationNo", ta.student_id AS "studentId",
  p.first_name AS "studentFirstName", p.last_name AS "studentLastName",
  ta.alert_type AS "alertType", ta.severity, ta.raised_at AS "raisedAt", ta.detail,
  ta.acknowledged_by AS "acknowledgedBy", ta.acknowledged_at AS "acknowledgedAt",
  ta.resolved_at AS "resolvedAt"`;

@Injectable()
export class TransportAlertRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(
    filter: TransportAlertFilter,
    executor: Queryable = this.postgres,
  ): Promise<{ rows: TransportAlertRow[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter.acknowledged !== undefined) {
      conditions.push(
        filter.acknowledged
          ? 'ta.acknowledged_at IS NOT NULL'
          : 'ta.acknowledged_at IS NULL',
      );
    }
    if (filter.severity) {
      params.push(filter.severity);
      conditions.push(`ta.severity = $${params.length}`);
    }
    if (filter.vehicleId) {
      params.push(filter.vehicleId);
      conditions.push(`ta.vehicle_id = $${params.length}`);
    }
    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await executor.query<{ count: string }>(
      `SELECT count(*) ${FROM} ${where}`,
      params,
    );
    const rowParams = [...params, filter.limit, filter.offset];
    const { rows } = await executor.query<TransportAlertRow>(
      `SELECT ${COLUMNS} ${FROM} ${where}
       ORDER BY ta.raised_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      rowParams,
    );
    return { rows, total: parseInt(countResult.rows[0].count, 10) };
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<TransportAlertRow | null> {
    const { rows } = await executor.query<TransportAlertRow>(
      `SELECT ${COLUMNS} ${FROM} WHERE ta.id = $1::bigint`,
      [id],
    );
    return rows[0] ?? null;
  }

  /** Only ever sets acknowledged_by/acknowledged_at from the authenticated
   * actor -- never a client-supplied acknowledger id. WHERE acknowledged_at
   * IS NULL makes a concurrent double-acknowledge a no-op (0 rows), not a
   * silent overwrite of who acknowledged first. */
  async acknowledge(
    id: string,
    personId: string,
    executor: Queryable = this.postgres,
  ): Promise<TransportAlertRow | null> {
    const { rows } = await executor.query<{ id: string }>(
      `UPDATE transport_alert SET acknowledged_by = $2, acknowledged_at = now()
       WHERE id = $1::bigint AND acknowledged_at IS NULL
       RETURNING id`,
      [id, personId],
    );
    if (rows.length === 0) return null;
    return this.findById(id, executor);
  }
}
