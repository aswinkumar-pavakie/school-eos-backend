// Writes one row per consequential change to audit_event. Every money-mutating action
// in Finance (and every approval decision) calls this in the same transaction as the
// change itself — an action that changed state but left no audit row is treated as a
// bug, not an acceptable gap, given this module's sensitivity.

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../infrastructure/postgres/postgres.service';

export interface AuditEntry {
  actorPersonId: string | null;
  actorRoleCode: string | null;
  action: string;
  objectType: string;
  objectId: string | null;
  outcome: string;
  correlationId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  beforeData?: unknown;
  afterData?: unknown;
}

@Injectable()
export class AuditService {
  constructor(private readonly postgres: PostgresService) {}

  async record(entry: AuditEntry, executor: Queryable = this.postgres): Promise<void> {
    await executor.query(
      `INSERT INTO audit_event
         (actor_person_id, actor_role_code, action, object_type, object_id, outcome,
          correlation_id, ip_address, user_agent, before_data, after_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        entry.actorPersonId,
        entry.actorRoleCode,
        entry.action,
        entry.objectType,
        entry.objectId,
        entry.outcome,
        entry.correlationId ?? null,
        entry.ipAddress ?? null,
        entry.userAgent ?? null,
        entry.beforeData ? JSON.stringify(entry.beforeData) : null,
        entry.afterData ? JSON.stringify(entry.afterData) : null,
      ],
    );
  }
}
