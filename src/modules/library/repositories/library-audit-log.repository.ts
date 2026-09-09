import { Injectable } from '@nestjs/common';
import { PostgresService } from '../../../infrastructure/postgres/postgres.service';
import {
  describeActivity,
  LIBRARY_OBJECT_TYPES,
} from '../library-overview.service';

export interface LibraryAuditLogRow {
  id: string;
  action: string;
  objectType: string;
  objectId: string;
  outcome: string;
  actorPersonId: string | null;
  actorName: string | null;
  actorRoleCode: string | null;
  correlationId: string | null;
  detail: string | null;
  occurredAt: Date;
  beforeData: unknown;
  afterData: unknown;
}

export interface AuditLogFilter {
  action?: string;
  objectType?: string;
  actorPersonId?: string;
  startDate?: string;
  endDate?: string;
  limit: number;
  offset: number;
}

/** Reports' "Transaction History" and Library's own "Audit / History" module
 * both read this same query -- one repository, over the same generic
 * audit_event table the Dashboard's recentActivity preview already reads too.
 * No second event log. The `object_type = ANY(LIBRARY_OBJECT_TYPES)` condition
 * is a hard, caller-independent constraint -- `objectType` further narrows
 * WITHIN that set, it can never widen past it, which is what keeps a Library
 * user from ever seeing another module's audit data through this endpoint. */
@Injectable()
export class LibraryAuditLogRepository {
  constructor(private readonly postgres: PostgresService) {}

  private mapRow(r: {
    id: string;
    action: string;
    object_type: string;
    object_id: string;
    outcome: string;
    actor_person_id: string | null;
    actor_first_name: string | null;
    actor_last_name: string | null;
    actor_role_code: string | null;
    correlation_id: string | null;
    occurred_at: Date;
    before_data: unknown;
    after_data: unknown;
  }): LibraryAuditLogRow {
    return {
      id: r.id,
      action: r.action,
      objectType: r.object_type,
      objectId: r.object_id,
      outcome: r.outcome,
      actorPersonId: r.actor_person_id,
      actorName: r.actor_first_name
        ? `${r.actor_first_name} ${r.actor_last_name ?? ''}`.trim()
        : null,
      actorRoleCode: r.actor_role_code,
      correlationId: r.correlation_id,
      detail: describeActivity(r.after_data, r.before_data),
      occurredAt: r.occurred_at,
      beforeData: r.before_data,
      afterData: r.after_data,
    };
  }

  async findMany(
    filter: AuditLogFilter,
  ): Promise<{ rows: LibraryAuditLogRow[]; total: number }> {
    const conditions: string[] = [`ae.object_type = ANY($1)`];
    const params: unknown[] = [LIBRARY_OBJECT_TYPES];
    if (filter.action) {
      params.push(filter.action);
      conditions.push(`ae.action = $${params.length}`);
    }
    if (filter.objectType) {
      params.push(filter.objectType);
      conditions.push(`ae.object_type = $${params.length}`);
    }
    if (filter.actorPersonId) {
      params.push(filter.actorPersonId);
      conditions.push(`ae.actor_person_id = $${params.length}`);
    }
    if (filter.startDate) {
      params.push(filter.startDate);
      conditions.push(`ae.occurred_at >= $${params.length}`);
    }
    if (filter.endDate) {
      params.push(filter.endDate);
      conditions.push(
        `ae.occurred_at < ($${params.length}::date + interval '1 day')`,
      );
    }
    const where = `WHERE ${conditions.join(' AND ')}`;

    const countResult = await this.postgres.query<{ count: string }>(
      `SELECT count(*) FROM audit_event ae ${where}`,
      params,
    );

    const rowParams = [...params, filter.limit, filter.offset];
    const { rows } = await this.postgres.query<{
      id: string;
      action: string;
      object_type: string;
      object_id: string;
      outcome: string;
      actor_person_id: string | null;
      actor_first_name: string | null;
      actor_last_name: string | null;
      actor_role_code: string | null;
      correlation_id: string | null;
      occurred_at: Date;
      before_data: unknown;
      after_data: unknown;
    }>(
      `SELECT ae.id, ae.action, ae.object_type, ae.object_id, ae.outcome,
              ae.actor_person_id, p.first_name AS actor_first_name, p.last_name AS actor_last_name,
              ae.actor_role_code, ae.correlation_id,
              ae.occurred_at, ae.before_data, ae.after_data
       FROM audit_event ae
       LEFT JOIN person p ON p.id = ae.actor_person_id
       ${where}
       ORDER BY ae.occurred_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      rowParams,
    );

    return {
      rows: rows.map((r) => this.mapRow(r)),
      total: parseInt(countResult.rows[0].count, 10),
    };
  }

  async findById(id: string): Promise<LibraryAuditLogRow | null> {
    const { rows } = await this.postgres.query<{
      id: string;
      action: string;
      object_type: string;
      object_id: string;
      outcome: string;
      actor_person_id: string | null;
      actor_first_name: string | null;
      actor_last_name: string | null;
      actor_role_code: string | null;
      correlation_id: string | null;
      occurred_at: Date;
      before_data: unknown;
      after_data: unknown;
    }>(
      `SELECT ae.id, ae.action, ae.object_type, ae.object_id, ae.outcome,
              ae.actor_person_id, p.first_name AS actor_first_name, p.last_name AS actor_last_name,
              ae.actor_role_code, ae.correlation_id,
              ae.occurred_at, ae.before_data, ae.after_data
       FROM audit_event ae
       LEFT JOIN person p ON p.id = ae.actor_person_id
       WHERE ae.id = $1 AND ae.object_type = ANY($2)`,
      [id, LIBRARY_OBJECT_TYPES],
    );
    if (!rows[0]) return null;
    return this.mapRow(rows[0]);
  }

  /** Real distinct values actually present, for filter dropdowns -- never a
   * hardcoded guess list. */
  async findFilterOptions(): Promise<{
    actions: string[];
    objectTypes: string[];
  }> {
    const [actionsResult, objectTypesResult] = await Promise.all([
      this.postgres.query<{ action: string }>(
        `SELECT DISTINCT action FROM audit_event WHERE object_type = ANY($1) ORDER BY action`,
        [LIBRARY_OBJECT_TYPES],
      ),
      this.postgres.query<{ object_type: string }>(
        `SELECT DISTINCT object_type FROM audit_event WHERE object_type = ANY($1) ORDER BY object_type`,
        [LIBRARY_OBJECT_TYPES],
      ),
    ]);
    return {
      actions: actionsResult.rows.map((r) => r.action),
      objectTypes: objectTypesResult.rows.map((r) => r.object_type),
    };
  }
}
