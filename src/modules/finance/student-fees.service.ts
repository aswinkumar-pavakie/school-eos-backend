import { Injectable } from '@nestjs/common';
import { StudentFeesRepository } from './repositories/student-fees.repository';

export type StudentFeeOverallStatus = 'NO_ASSIGNMENT' | 'PAID' | 'PARTIAL' | 'PENDING' | 'OVERDUE';

@Injectable()
export class StudentFeesService {
  constructor(private readonly studentFeesRepo: StudentFeesRepository) {}

  async getSummaryForStudent(studentId: string) {
    const [assignment, payments] = await Promise.all([
      this.studentFeesRepo.findCurrentAssignment(studentId),
      this.studentFeesRepo.findPaymentsForStudent(studentId),
    ]);
    if (!assignment) {
      return {
        assignment: null,
        demands: [],
        payments,
        totalDuePaise: '0',
        totalPaidPaise: '0',
        totalPendingPaise: '0',
        totalOverduePaise: '0',
        overallStatus: 'NO_ASSIGNMENT' as StudentFeeOverallStatus,
      };
    }

    const demands = await this.studentFeesRepo.findDemandsByAssignment(assignment.id);

    let totalDue = 0n;
    let totalPaid = 0n;
    let totalPending = 0n;
    let totalOverdue = 0n;
    let hasOverdue = false;
    let hasUnpaid = false;
    for (const d of demands) {
      const amount = BigInt(d.amountPaise) + BigInt(d.lateFeePaise);
      const paid = BigInt(d.paidPaise);
      const balance = amount - paid;
      totalDue += balance;
      totalPaid += paid;
      if (d.state === 'PENDING') totalPending += balance;
      if (d.state === 'OVERDUE') {
        totalOverdue += balance;
        hasOverdue = true;
      }
      if (d.state === 'PENDING' || d.state === 'PARTIAL' || d.state === 'OVERDUE') hasUnpaid = true;
    }

    const overallStatus: StudentFeeOverallStatus = hasOverdue
      ? 'OVERDUE'
      : !hasUnpaid
        ? 'PAID'
        : totalPaid > 0n
          ? 'PARTIAL'
          : 'PENDING';

    return {
      assignment,
      demands,
      payments,
      totalDuePaise: totalDue.toString(),
      totalPaidPaise: totalPaid.toString(),
      totalPendingPaise: totalPending.toString(),
      totalOverduePaise: totalOverdue.toString(),
      overallStatus,
    };
  }
}
