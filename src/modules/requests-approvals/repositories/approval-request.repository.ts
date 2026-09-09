import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface ApprovalRequestRow {
  id: string;
  requestType: string;
  subjectObjectType: string | null;
  subjectObjectId: string | null;
  requestedBy: string;
  requestedByName: string | null;
  requestedByRoleCode: string | null;
  payload: Record<string, unknown>;
  currentStep: number;
  state: string;
  approverRoleCode: string | null;
  decidedByName: string | null;
  decisionComment: string | null;
  createdAt: Date;
  decidedAt: Date | null;
  updatedAt: Date;
}

export interface CreateApprovalRequestInput {
  requestType: string;
  subjectObjectType?: string | null;
  subjectObjectId?: string | null;
  requestedBy: string;
  payload: Record<string, unknown>;
}

export interface ApprovalRequestFilter {
  requestType?: string;
  state?: string;
  states?: string[];
  search?: string;
  limit: number;
  offset: number;
}

const COLUMNS = `ar.id, ar.request_type AS "requestType", ar.subject_object_type AS "subjectObjectType",
  ar.subject_object_id AS "subjectObjectId", ar.requested_by AS "requestedBy",
  (CASE WHEN rp.id IS NOT NULL THEN trim(both ' ' from rp.first_name || ' ' || coalesce(rp.last_name, '')) END)
    AS "requestedByName",
  (SELECT role_code FROM role_assignment WHERE person_id = ar.requested_by AND status = 'ACTIVE'
    ORDER BY role_code LIMIT 1) AS "requestedByRoleCode",
  ar.payload, ar.current_step AS "currentStep", ar.state,
  cs.approver_role_code AS "approverRoleCode",
  (CASE WHEN dp.id IS NOT NULL THEN trim(both ' ' from dp.first_name || ' ' || coalesce(dp.last_name, '')) END)
    AS "decidedByName",
  cs.comment AS "decisionComment",
  ar.created_at AS "createdAt", ar.decided_at AS "decidedAt", ar.updated_at AS "updatedAt"`;

const FROM = `approval_request ar
  LEFT JOIN person rp ON rp.id = ar.requested_by
  LEFT JOIN approval_step cs ON cs.request_id = ar.id AND cs.sequence_no = ar.current_step
  LEFT JOIN person dp ON dp.id = cs.decided_by`;

@Injectable()
export class ApprovalRequestRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findMany(
    filter: ApprovalRequestFilter,
    executor: Queryable = this.postgres,
  ): Promise<{ rows: ApprovalRequestRow[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.requestType) {
      params.push(filter.requestType);
      conditions.push(`ar.request_type = $${params.length}`);
    }
    if (filter.state) {
      params.push(filter.state);
      conditions.push(`ar.state = $${params.length}`);
    } else if (filter.states && filter.states.length > 0) {
      params.push(filter.states);
      conditions.push(`ar.state = ANY($${params.length}::text[])`);
    }
    if (filter.search) {
      params.push(`%${filter.search.toLowerCase()}%`);
      conditions.push(
        `(lower(coalesce(rp.first_name, '')) LIKE $${params.length} OR lower(coalesce(rp.last_name, '')) LIKE $${params.length}
          OR lower(coalesce(ar.payload->>'description', '')) LIKE $${params.length})`,
      );
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await this.postgres.query<{ count: string }>(
      `SELECT count(*) FROM ${FROM} ${where}`,
      params,
    );
    const rowParams = [...params, filter.limit, filter.offset];
    const { rows } = await executor.query<ApprovalRequestRow>(
      `SELECT ${COLUMNS} FROM ${FROM} ${where}
       ORDER BY ar.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      rowParams,
    );
    return { rows, total: parseInt(countResult.rows[0].count, 10) };
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<ApprovalRequestRow | null> {
    const { rows } = await executor.query<ApprovalRequestRow>(
      `SELECT ${COLUMNS} FROM ${FROM} WHERE ar.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  /** Row-locking read, for use inside a transaction right before a status
   * change that must not race with a concurrent decision on the same request. */
  async findByIdForUpdate(
    id: string,
    executor: Queryable,
  ): Promise<ApprovalRequestRow | null> {
    const { rows } = await executor.query<ApprovalRequestRow>(
      `SELECT ${COLUMNS} FROM ${FROM} WHERE ar.id = $1 FOR UPDATE OF ar`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    input: CreateApprovalRequestInput,
    executor: Queryable,
  ): Promise<ApprovalRequestRow> {
    const { rows } = await executor.query<{ id: string }>(
      `INSERT INTO approval_request
         (request_type, subject_object_type, subject_object_id, requested_by, payload, current_step, state)
       VALUES ($1, $2, $3, $4, $5, 1, 'PENDING')
       RETURNING id`,
      [
        input.requestType,
        input.subjectObjectType ?? null,
        input.subjectObjectId ?? null,
        input.requestedBy,
        JSON.stringify(input.payload),
      ],
    );
    return (await this.findById(rows[0].id, executor))!;
  }

  async setState(
    id: string,
    state: string,
    executor: Queryable,
    decidedAt?: Date | null,
  ): Promise<void> {
    await executor.query(
      `UPDATE approval_request SET state = $2, decided_at = $3, updated_at = now() WHERE id = $1`,
      [id, state, decidedAt ?? null],
    );
  }

  /** The real, authoritative approver for a request type's first step, straight
   * from approval_policy -- never hardcoded, so if that policy is ever
   * repointed to a different role, this workflow stops accepting it instead of
   * silently letting Admin decide something that's no longer Admin's to decide. */
  async findFirstStepApproverRole(
    requestType: string,
    executor: Queryable = this.postgres,
  ): Promise<string | null> {
    const { rows } = await executor.query<{ approver_role_code: string }>(
      `SELECT approver_role_code FROM approval_policy
       WHERE request_type = $1 AND sequence_no = 1 AND status = 'ACTIVE'`,
      [requestType],
    );
    return rows[0]?.approver_role_code ?? null;
  }

  async mergePayload(
    id: string,
    patch: Record<string, unknown>,
    executor: Queryable,
  ): Promise<void> {
    await executor.query(
      `UPDATE approval_request SET payload = payload || $2::jsonb, updated_at = now() WHERE id = $1`,
      [id, JSON.stringify(patch)],
    );
  }

  /** Used by Admin Reports' status-breakdown donut. */
  async countByState(executor: Queryable = this.postgres): Promise<{ state: string; count: number }[]> {
    const { rows } = await executor.query<{ state: string; count: string }>(
      `SELECT state, count(*) AS count FROM approval_request GROUP BY state`,
    );
    return rows.map((r) => ({ state: r.state, count: parseInt(r.count, 10) }));
  }

  /** Used by Admin Reports' volume-by-request-type bar. */
  async countByType(executor: Queryable = this.postgres): Promise<{ requestType: string; count: number }[]> {
    const { rows } = await executor.query<{ requestType: string; count: string }>(
      `SELECT request_type AS "requestType", count(*) AS count FROM approval_request GROUP BY request_type ORDER BY count(*) DESC`,
    );
    return rows.map((r) => ({ requestType: r.requestType, count: parseInt(r.count, 10) }));
  }
}
