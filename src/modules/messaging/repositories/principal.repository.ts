// Narrow, read-only check: does this personId currently hold an ACTIVE PRINCIPAL
// role_assignment? Mirrors ClassAdvisorRepository's query style
// (v_active_role_assignment is the real, existing source of truth for "who
// currently holds this role" -- status/valid_from/valid_to already resolved by the
// view, never re-derived here). Kept private to messaging like every other
// repository in this module.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

@Injectable()
export class PrincipalRepository {
  constructor(private readonly postgres: PostgresService) {}

  async isActivePrincipal(
    personId: string,
    executor: Queryable = this.postgres,
  ): Promise<boolean> {
    const { rows } = await executor.query(
      `SELECT 1 FROM v_active_role_assignment WHERE person_id = $1 AND role_code = 'PRINCIPAL' LIMIT 1`,
      [personId],
    );
    return rows.length > 0;
  }

  /** Every personId (of the given candidates) that currently holds an ACTIVE
   * PRINCIPAL role_assignment -- batched version of isActivePrincipal, for the
   * bulk conversation-list summary builder (same reasoning as
   * SubjectOfferingRepository.findActiveTeachersForSections: one query across many
   * candidates instead of one query per candidate). */
  async filterActivePrincipals(
    personIds: string[],
    executor: Queryable = this.postgres,
  ): Promise<Set<string>> {
    if (personIds.length === 0) return new Set();
    const { rows } = await executor.query<{ person_id: string }>(
      `SELECT DISTINCT person_id FROM v_active_role_assignment
       WHERE person_id = ANY($1::uuid[]) AND role_code = 'PRINCIPAL'`,
      [personIds],
    );
    return new Set(rows.map((r) => r.person_id));
  }

  /** Verifies a specific personId currently holds an ACTIVE FACULTY
   * role_assignment -- the server-side check before a Principal can start a direct
   * conversation with them (never trust the client's claim that a picked person is
   * really a faculty member). */
  async isActiveFaculty(
    personId: string,
    executor: Queryable = this.postgres,
  ): Promise<boolean> {
    const { rows } = await executor.query(
      `SELECT 1 FROM v_active_role_assignment WHERE person_id = $1 AND role_code = 'FACULTY' LIMIT 1`,
      [personId],
    );
    return rows.length > 0;
  }
}
