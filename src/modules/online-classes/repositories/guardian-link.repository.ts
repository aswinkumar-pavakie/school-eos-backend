// Narrow, auth-scoped read access to guardian_link — resolves a parent's active wards
// from their person_id. Exists only for Online Classes' parent-read-access needs
// (mirrors StaffRepository's role in this same module); the real people module, which
// would eventually own guardian_link, is still an unimplemented stub — this repository
// does not touch or depend on it.
//
// This is a fast-path existence check only ("does this parent have any active ward at
// all"), never the authorization decision for any specific online class — that's always
// the self-contained JOIN in OnlineClassRepository.listForParent/findParentDetailById,
// which re-joins guardian_link itself rather than trusting a list resolved here.

import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

@Injectable()
export class GuardianLinkRepository {
  constructor(private readonly postgres: PostgresService) {}

  /** Never cached — resolved fresh from the database on every call. */
  async findActiveWardStudentIds(
    personId: string,
    executor: Queryable = this.postgres,
  ): Promise<string[]> {
    const { rows } = await executor.query<{ student_id: string }>(
      `SELECT student_id FROM guardian_link WHERE person_id = $1 AND status = 'ACTIVE'`,
      [personId],
    );
    return rows.map((row) => row.student_id);
  }
}
