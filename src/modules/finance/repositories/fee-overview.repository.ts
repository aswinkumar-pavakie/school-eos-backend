import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  Queryable,
} from '../../../infrastructure/postgres/postgres.service';

export interface FeeOverviewCounts {
  totalFeesPaise: string;
  totalCollectedPaise: string;
  totalPendingPaise: string;
  totalOutstandingPaise: string;
  totalOverduePaise: string;
  studentsWithPendingCount: number;
  studentsWithOverdueCount: number;
}

/** Admin's read-only Fee Overview -- every figure comes straight out of
 * fee_demand.state, the same authoritative state Finance's own collections
 * flow maintains. Nothing here is computed by re-deriving "overdue" from
 * due_date, since due dates from a closed academic year are all in the past
 * regardless of whether that instalment was ever actually paid on time --
 * the stored state is the real source of truth. */
@Injectable()
export class FeeOverviewRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findOverviewCounts(
    academicYearId: string | undefined,
    executor: Queryable = this.postgres,
  ): Promise<FeeOverviewCounts> {
    const params: unknown[] = [];
    let yearJoin = '';
    let yearWhere = '';
    if (academicYearId) {
      params.push(academicYearId);
      yearJoin = 'JOIN student_fee_assignment sfa ON sfa.id = fd.assignment_id';
      yearWhere = `WHERE sfa.academic_year_id = $${params.length}`;
    }

    const { rows } = await executor.query<{
      total_fees: string;
      total_collected: string;
      total_pending: string;
      total_outstanding: string;
      total_overdue: string;
      students_pending: string;
      students_overdue: string;
    }>(
      `SELECT
         coalesce(sum(fd.amount_paise + fd.late_fee_paise) FILTER (WHERE fd.state != 'CANCELLED'), 0) AS total_fees,
         coalesce(sum(fd.paid_paise), 0) AS total_collected,
         coalesce(sum(fd.amount_paise + fd.late_fee_paise - fd.paid_paise) FILTER (WHERE fd.state = 'PENDING'), 0) AS total_pending,
         coalesce(sum(fd.amount_paise + fd.late_fee_paise - fd.paid_paise)
           FILTER (WHERE fd.state IN ('PENDING', 'PARTIAL', 'OVERDUE')), 0) AS total_outstanding,
         coalesce(sum(fd.amount_paise + fd.late_fee_paise - fd.paid_paise) FILTER (WHERE fd.state = 'OVERDUE'), 0) AS total_overdue,
         count(DISTINCT fd.student_id) FILTER (WHERE fd.state = 'PENDING') AS students_pending,
         count(DISTINCT fd.student_id) FILTER (WHERE fd.state = 'OVERDUE') AS students_overdue
       FROM fee_demand fd
       ${yearJoin}
       ${yearWhere}`,
      params,
    );
    const row = rows[0];
    return {
      totalFeesPaise: row.total_fees,
      totalCollectedPaise: row.total_collected,
      totalPendingPaise: row.total_pending,
      totalOutstandingPaise: row.total_outstanding,
      totalOverduePaise: row.total_overdue,
      studentsWithPendingCount: parseInt(row.students_pending, 10),
      studentsWithOverdueCount: parseInt(row.students_overdue, 10),
    };
  }
}
