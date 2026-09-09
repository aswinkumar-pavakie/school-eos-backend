// sport_od_request does NOT exist in the database yet — written exactly as it
// will run once query.md's CREATE TABLE has been applied (same convention as
// permission-activity.repository.ts documents for a not-yet-created table).
// Bridges a team/fixture to the existing, ALREADY-LIVE student_event /
// student_event_participant tables (see student-events module) once Principal
// approves — this table itself is intentionally thin, it never duplicates
// anything student_event already models.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export type SportOdRequestState =
  'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface SportOdRequestRow {
  id: string;
  teamId: string;
  teamName: string;
  sportId: string;
  sportName: string;
  fixtureId: string | null;
  eventDate: string;
  reason: string;
  requestedBy: string;
  approvalRequestId: string | null;
  studentEventId: string | null;
  state: SportOdRequestState;
  createdAt: Date;
}

const COLUMNS = `r.id, r.team_id AS "teamId", t.name AS "teamName", r.sport_id AS "sportId",
  sp.name AS "sportName", r.fixture_id AS "fixtureId", r.event_date AS "eventDate", r.reason,
  r.requested_by AS "requestedBy", r.approval_request_id AS "approvalRequestId",
  r.student_event_id AS "studentEventId", r.state, r.created_at AS "createdAt"`;

const FROM = `FROM sport_od_request r JOIN team t ON t.id = r.team_id JOIN sport sp ON sp.id = r.sport_id`;

@Injectable()
export class SportOdRequestRepository {
  constructor(private readonly postgres: PostgresService) {}

  async create(
    input: {
      teamId: string;
      sportId: string;
      fixtureId?: string | null;
      eventDate: string;
      reason: string;
      requestedBy: string;
    },
    executor: Queryable,
  ): Promise<SportOdRequestRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO sport_od_request (team_id, sport_id, fixture_id, event_date, reason, requested_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        input.teamId,
        input.sportId,
        input.fixtureId ?? null,
        input.eventDate,
        input.reason,
        input.requestedBy,
      ],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<SportOdRequestRow | null> {
    const { rows } = await executor.query<SportOdRequestRow>(
      `SELECT ${COLUMNS} ${FROM} WHERE r.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findBySportIds(
    sportIds: string[],
    executor: Queryable = this.postgres,
  ): Promise<SportOdRequestRow[]> {
    if (sportIds.length === 0) return [];
    const { rows } = await executor.query<SportOdRequestRow>(
      `SELECT ${COLUMNS} ${FROM} WHERE r.sport_id = ANY($1::uuid[]) ORDER BY r.created_at DESC`,
      [sportIds],
    );
    return rows;
  }

  async linkApprovalRequest(
    id: string,
    approvalRequestId: string,
    executor: Queryable,
  ): Promise<void> {
    await executor.query(
      `UPDATE sport_od_request SET approval_request_id = $2 WHERE id = $1`,
      [id, approvalRequestId],
    );
  }

  async setState(
    id: string,
    state: SportOdRequestState,
    executor: Queryable,
  ): Promise<void> {
    await executor.query(
      `UPDATE sport_od_request SET state = $2, updated_at = now() WHERE id = $1`,
      [id, state],
    );
  }

  /** Approval sets both state and the resulting student_event's id, atomically —
   * never a request left APPROVED with no linked event (or vice-versa). */
  async markApproved(
    id: string,
    studentEventId: string,
    executor: Queryable,
  ): Promise<void> {
    await executor.query(
      `UPDATE sport_od_request SET state = 'APPROVED', student_event_id = $2, updated_at = now() WHERE id = $1`,
      [id, studentEventId],
    );
  }
}
