import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface ApprovalRequestRow {
  id: string;
  requestType: string;
  subjectObjectType: string;
  subjectObjectId: string;
  requestedBy: string;
  requestedByName: string | null;
  payload: Record<string, unknown>;
  amountPaise: string | null;
  currentStep: number;
  state: string;
  dueAt: Date | null;
  decidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateApprovalRequestInput {
  requestType: string;
  subjectObjectType: string;
  subjectObjectId: string;
  requestedBy: string;
  payload?: Record<string, unknown>;
  amountPaise?: string | null;
  dueAt?: Date | null;
  initialState: 'PENDING' | 'RETROSPECTIVE_PENDING';
}

export interface ListApprovalsFilter {
  requestType?: string;
  states: string[];
}

function mapRow(row: any): ApprovalRequestRow {
  return {
    id: row.id,
    requestType: row.request_type,
    subjectObjectType: row.subject_object_type,
    subjectObjectId: row.subject_object_id,
    requestedBy: row.requested_by,
    requestedByName: row.requested_by_name ?? null,
    payload: row.payload ?? {},
    amountPaise: row.amount_paise,
    currentStep: row.current_step,
    state: row.state,
    dueAt: row.due_at,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLUMNS = `id, request_type, subject_object_type, subject_object_id, requested_by,
  payload, amount_paise, current_step, state, due_at, decided_at, created_at, updated_at`;

@Injectable()
export class ApprovalRequestRepository {
  constructor(private readonly postgres: PostgresService) {}

  async create(
    input: CreateApprovalRequestInput,
    executor: Queryable = this.postgres,
  ): Promise<ApprovalRequestRow> {
    const { rows } = await executor.query(
      `INSERT INTO approval_request
         (request_type, subject_object_type, subject_object_id, requested_by, payload,
          amount_paise, current_step, state, due_at)
       VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8)
       RETURNING ${SELECT_COLUMNS}`,
      [
        input.requestType,
        input.subjectObjectType,
        input.subjectObjectId,
        input.requestedBy,
        JSON.stringify(input.payload ?? {}),
        input.amountPaise ?? null,
        input.initialState,
        input.dueAt ?? null,
      ],
    );
    return mapRow(rows[0]);
  }

  async findById(
    id: string,
    executor: Queryable = this.postgres,
  ): Promise<ApprovalRequestRow | null> {
    const { rows } = await executor.query(
      `SELECT ar.*, p.display_name AS requested_by_name
       FROM approval_request ar
       LEFT JOIN person p ON p.id = ar.requested_by
       WHERE ar.id = $1`,
      [id],
    );
    return rows.length ? mapRow(rows[0]) : null;
  }

  /** Locks the row for the duration of the caller's transaction — required before any decision write. */
  async findByIdForUpdate(
    id: string,
    executor: Queryable,
  ): Promise<ApprovalRequestRow | null> {
    const { rows } = await executor.query(
      `SELECT ${SELECT_COLUMNS} FROM approval_request WHERE id = $1 FOR UPDATE`,
      [id],
    );
    return rows.length ? mapRow(rows[0]) : null;
  }

  async advanceToNextStep(id: string, executor: Queryable): Promise<void> {
    await executor.query(
      `UPDATE approval_request SET current_step = current_step + 1, updated_at = now() WHERE id = $1`,
      [id],
    );
  }

  async markDecided(
    id: string,
    finalState: 'APPROVED' | 'REJECTED',
    executor: Queryable,
  ): Promise<void> {
    await executor.query(
      `UPDATE approval_request SET state = $2, decided_at = now(), updated_at = now() WHERE id = $1`,
      [id, finalState],
    );
  }

  /** approval_decided_ts requires decided_at set for CANCELLED too, same as APPROVED/REJECTED. */
  async markCancelled(id: string, executor: Queryable): Promise<void> {
    await executor.query(
      `UPDATE approval_request SET state = 'CANCELLED', decided_at = now(), updated_at = now() WHERE id = $1`,
      [id],
    );
  }

  /**
   * The caller's inbox. `forHistory=false` returns requests currently awaiting a
   * decision that could be made by one of `callerRoles`, scope-checked against the
   * caller's own role_assignment rows. `forHistory=true` returns requests this exact
   * person has already decided (approved/rejected), for the history view.
   */
  async listForCaller(
    callerId: string,
    callerRoles: string[],
    forHistory: boolean,
    filter: ListApprovalsFilter,
    executor: Queryable = this.postgres,
  ): Promise<ApprovalRequestRow[]> {
    if (callerRoles.length === 0) return [];
    const { rows } = await executor.query(
      `SELECT ar.id, ar.request_type, ar.subject_object_type, ar.subject_object_id, ar.requested_by,
              p.display_name AS requested_by_name,
              ar.payload, ar.amount_paise, ar.current_step, ar.state, ar.due_at, ar.decided_at,
              ar.created_at, ar.updated_at
       FROM approval_request ar
       JOIN approval_step ast ON ast.request_id = ar.id AND ast.sequence_no = ar.current_step
       LEFT JOIN person p ON p.id = ar.requested_by
       WHERE ast.approver_role_code = ANY($1)
         AND ar.state = ANY($2)
         AND (
           ($3 = false AND ast.decision IS NULL)
           OR ($3 = true AND ast.decided_by = $4)
         )
         AND ($5::text IS NULL OR ar.request_type = $5)
         AND EXISTS (
           SELECT 1 FROM v_active_role_assignment vra
           WHERE vra.person_id = $4
             AND vra.role_code = ast.approver_role_code
             AND (
               NOT (ar.payload ? 'approverScope')
               OR (
                 vra.scope_type = (ar.payload -> 'approverScope' ->> 'scopeType')
                 AND vra.scope_id::text = (ar.payload -> 'approverScope' ->> 'scopeId')
               )
             )
         )
       ORDER BY ar.due_at ASC NULLS LAST, ar.created_at ASC`,
      [
        callerRoles,
        filter.states,
        forHistory,
        callerId,
        filter.requestType ?? null,
      ],
    );
    return rows.map(mapRow);
  }
}
