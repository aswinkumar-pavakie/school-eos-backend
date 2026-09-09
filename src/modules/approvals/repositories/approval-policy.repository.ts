// Reads the seeded approval_policy table — the routing rules for which role_code
// approves which step of which request_type. `condition` is free-form JSON; the only
// shape this repository understands is an (optional) amount_paise band, since that's
// the only variable approval_request itself carries. An empty condition ({}) always
// matches — most request types need just one unconditional step.

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
): boolean {
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

  /** Resolves the ordered step chain for a request_type given its amount (if any), picking exactly one matching band per sequence_no. */
  async resolveStepChain(
    requestType: string,
    amountPaise: string | null,
    executor: Queryable = this.postgres,
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
       ORDER BY sequence_no ASC`,
      [requestType],
    );

    const bySequence = new Map<number, ApprovalPolicyStep>();
    for (const row of rows) {
      if (bySequence.has(row.sequence_no)) continue;
      if (!matchesCondition(row.condition ?? {}, amountPaise)) continue;
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
