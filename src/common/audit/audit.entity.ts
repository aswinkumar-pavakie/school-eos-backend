// Shape of a row in `audit_event` -- one per consequential action. Written by anything
// that needs an audit trail (currently: login success/failure), read back by the
// Identity module's login-activity / audit screens.

export interface AuditEventInput {
  actorPersonId?: string | null;
  actorRoleCode?: string | null;
  action: string;
  objectType: string;
  objectId?: string | null;
  // Matches audit_event's own CHECK constraint exactly -- there is no 'FAILURE' value.
  outcome: 'SUCCESS' | 'DENIED' | 'ERROR';
  ipAddress?: string | null;
  userAgent?: string | null;
  correlationId?: string | null;
  beforeData?: unknown;
  afterData?: unknown;
}

export interface AuditEventRow {
  id: string;
  actorPersonId: string | null;
  actorName: string | null;
  actorRoleCode: string | null;
  action: string;
  objectType: string;
  objectId: string | null;
  outcome: string;
  correlationId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  occurredAt: Date;
  beforeData: unknown;
  afterData: unknown;
}
