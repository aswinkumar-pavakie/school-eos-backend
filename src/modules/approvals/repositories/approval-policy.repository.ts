// Reads the seeded approval_policy table — the routing rules for which role_code
// approves which step of which request_type. `condition` is free-form JSON.
// Two shapes are understood: an (optional) amount_paise band (the original,
// still the only variable most request types need), and an optional
// `requesterHasRole` (a single role code) -- added so a request type can route
// differently depending on who raised it (e.g. STAFF_LEAVE_REQUEST: a normal
// staff member's leave still routes to PRINCIPAL, but when the Principal
// requests their OWN leave, self-approval is correctly blocked elsewhere and
// nobody else could ever decide it without this -- routes to ADMIN instead).
// An empty condition ({}) always matches — most request types need just one
// unconditional step, and existing rows/callers are completely unaffected by
// this addition (requesterRoleCodes defaults to undefined, and no existing
// row's condition has a requesterHasRole key).

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface ApprovalPolicyStep {
  sequenceNo: number;
  approverRoleCode: string;
  isFinal: boolean;
  slaHours: number | null;
  isRetrospective: boolean;
  condition: Record<string, unknown>;
}

function matchesCondition(
  condition: Record<string, unknown>,
  amountPaise: string | null,
  requesterRoleCodes: string[] | undefined,
): boolean {
  const requesterHasRole = condition.requesterHasRole;
  if (requesterHasRole !== undefined) {
    if (!requesterRoleCodes?.includes(requesterHasRole as string)) return false;
  }
  const min = condition.minAmountPaise;
  const max = condition.maxAmountPaise;
  if (min === undefined && max === undefined) return true;
  if (amountPaise === null) return false;
  const amount = BigInt(amountPaise);
  if (min !== undefined && amount < BigInt(min as number)) return false;
  if (max !== undefined && amount > BigInt(max as number)) return false;
  return true;
}

@Injectable()
export class ApprovalPolicyRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** Resolves the ordered step chain for a request_type given its amount (if
   * any) and the requester's own role(s) (if any), picking exactly one
   * matching row per sequence_no. Rows with a more specific (non-empty)
   * condition are considered before the catch-all `{}` row at the same
   * sequence_no -- the secondary ORDER BY only ever matters when a
   * request_type genuinely has two rows sharing a sequence_no (today, only
   * STAFF_LEAVE_REQUEST does); every other request_type's single row per
   * sequence_no is completely unaffected. */
  async resolveStepChain(
    requestType: string,
    amountPaise: string | null,
    executor: Queryable = this.postgres,
    requesterRoleCodes?: string[],
  ): Promise<ApprovalPolicyStep[]> {
    const { rows } = await executor.query<{
      sequence_no: number;
      approver_role_code: string;
      is_final: boolean;
      sla_hours: number | null;
      is_retrospective: boolean;
      condition: Record<string, unknown>;
    }>(
      `SELECT sequence_no, approver_role_code, is_final, sla_hours, is_retrospective, condition
       FROM approval_policy
       WHERE request_type = $1 AND status = 'ACTIVE'
       ORDER BY sequence_no ASC, (condition = '{}'::jsonb) ASC`,
      [requestType],
    );

    const bySequence = new Map<number, ApprovalPolicyStep>();
    for (const row of rows) {
      if (bySequence.has(row.sequence_no)) continue;
      if (
        !matchesCondition(row.condition ?? {}, amountPaise, requesterRoleCodes)
      )
        continue;
      bySequence.set(row.sequence_no, {
        sequenceNo: row.sequence_no,
        approverRoleCode: row.approver_role_code,
        isFinal: row.is_final,
        slaHours: row.sla_hours,
        isRetrospective: row.is_retrospective,
        condition: row.condition ?? {},
      });
    }
    return Array.from(bySequence.values()).sort(
      (a, b) => a.sequenceNo - b.sequenceNo,
    );
  }
}
