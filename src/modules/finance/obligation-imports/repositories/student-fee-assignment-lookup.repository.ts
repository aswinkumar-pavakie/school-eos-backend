// Minimal read-only lookup used only to validate bulk-import rows reference a real
// assignment — not a full repository over student_fee_assignment (no other Finance
// sub-feature in this build writes that table).

import { Injectable } from '@nestjs/common';
import { PostgresService, Queryable } from '../../../../infrastructure/postgres/postgres.service';

@Injectable()
export class StudentFeeAssignmentLookupRepository {
  constructor(private readonly postgres: PostgresService) {}

  async exists(assignmentId: string, studentId: string, executor: Queryable = this.postgres): Promise<boolean> {
    const { rows } = await executor.query(
      `SELECT 1 FROM student_fee_assignment WHERE id = $1 AND student_id = $2 LIMIT 1`,
      [assignmentId, studentId],
    );
    return rows.length > 0;
  }
}
