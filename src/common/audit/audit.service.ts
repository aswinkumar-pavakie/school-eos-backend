// Writes one row per consequential action to audit_event, and reads them back for
// audit-trail / login-activity screens. Every money-mutating action in Finance (and
// every approval decision) calls record() in the same transaction as the change
// itself — an action that changed state but left no audit row is treated as a bug,
// not an acceptable gap, given that module's sensitivity. A thin wrapper over raw
// SQL, not an ORM entity — consistent with the rest of this codebase (see
// infrastructure/postgres/postgres.service.ts).

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../infrastructure/postgres/postgres.service';
import { AuditEventInput, AuditEventRow } from './audit.entity';

export interface AuditEventQuery {
  actorPersonId?: string;
  action?: string[];
  objectType?: string;
  objectId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

@Injectable()
export class AuditService {
  constructor(private readonly postgres: PostgresService) {}

  async record(
    input: AuditEventInput,
    executor: Queryable = this.postgres,
  ): Promise<void> {
    await executor.query(
      `INSERT INTO audit_event
         (actor_person_id, actor_role_code, action, object_type, object_id, outcome,
          correlation_id, ip_address, user_agent, before_data, after_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        input.actorPersonId ?? null,
        input.actorRoleCode ?? null,
        input.action,
        input.objectType,
        input.objectId ?? null,
        input.outcome,
        input.correlationId ?? null,
        input.ipAddress ?? null,
        input.userAgent ?? null,
        input.beforeData !== undefined
          ? JSON.stringify(input.beforeData)
          : null,
        input.afterData !== undefined ? JSON.stringify(input.afterData) : null,
      ],
    );
  }

  async query(
    filter: AuditEventQuery = {},
  ): Promise<{ rows: AuditEventRow[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.actorPersonId) {
      params.push(filter.actorPersonId);
      conditions.push(`audit_event.actor_person_id = $${params.length}`);
    }
    if (filter.action && filter.action.length > 0) {
      params.push(filter.action);
      conditions.push(`action = ANY($${params.length})`);
    }
    if (filter.objectType) {
      params.push(filter.objectType);
      conditions.push(`object_type = $${params.length}`);
    }
    if (filter.objectId) {
      params.push(filter.objectId);
      conditions.push(`object_id = $${params.length}`);
    }
    if (filter.from) {
      params.push(filter.from);
      conditions.push(`occurred_at >= $${params.length}`);
    }
    if (filter.to) {
      params.push(filter.to);
      conditions.push(`occurred_at <= $${params.length}`);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(filter.limit ?? 50, 200);
    const offset = filter.offset ?? 0;

    const countResult = await this.postgres.query<{ count: string }>(
      `SELECT count(*) FROM audit_event ${where}`,
      params,
    );

    const rowParams = [...params, limit, offset];
    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;

    const rowsResult = await this.postgres.query<{
      id: string;
      actor_person_id: string | null;
      actor_first_name: string | null;
      actor_last_name: string | null;
      actor_role_code: string | null;
      action: string;
      object_type: string;
      object_id: string | null;
      outcome: string;
      correlation_id: string | null;
      ip_address: string | null;
      user_agent: string | null;
      occurred_at: Date;
      before_data: unknown;
      after_data: unknown;
    }>(
      `SELECT audit_event.id, audit_event.actor_person_id,
              person.first_name AS actor_first_name, person.last_name AS actor_last_name,
              audit_event.actor_role_code, audit_event.action, audit_event.object_type,
              audit_event.object_id, audit_event.outcome, audit_event.correlation_id,
              audit_event.ip_address, audit_event.user_agent, audit_event.occurred_at,
              audit_event.before_data, audit_event.after_data
       FROM audit_event
       LEFT JOIN person ON person.id = audit_event.actor_person_id
       ${where}
       ORDER BY audit_event.occurred_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      rowParams,
    );

    return {
      total: parseInt(countResult.rows[0].count, 10),
      rows: rowsResult.rows.map((row) => ({
        id: row.id,
        actorPersonId: row.actor_person_id,
        actorName: row.actor_first_name
          ? [row.actor_first_name, row.actor_last_name]
              .filter(Boolean)
              .join(' ')
          : null,
        actorRoleCode: row.actor_role_code,
        action: row.action,
        objectType: row.object_type,
        objectId: row.object_id,
        outcome: row.outcome,
        correlationId: row.correlation_id,
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
        occurredAt: row.occurred_at,
        beforeData: row.before_data,
        afterData: row.after_data,
      })),
    };
  }
}
