// Canteen counter's own service -- see canteen.repository.ts's own header
// comment for why chargeWallet needs a transaction (idempotency check +
// row lock + debit + ledger insert must be atomic against a retried or
// near-simultaneous charge). A real, permanent audit trail is written for
// every charge attempt -- successful, replayed, AND failed -- matching
// this codebase's own established rule for every money-mutating action
// (see expenses.service.ts and the rest of the Finance module: "an action
// that changed state but left no audit row is treated as a bug"). A failed
// attempt's audit row is written OUTSIDE the rolled-back transaction (on
// the plain pool, not the dead client) specifically so the trail survives
// even though the wallet itself was never touched -- otherwise a string of
// insufficient-balance or frozen-wallet attempts (real signals worth
// reviewing) would leave no trace at all.

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { ChargeWalletDto } from './dto/charge-wallet.dto';
import {
  CanteenHistoryRow,
  CanteenRepository,
} from './repositories/canteen.repository';

export interface CanteenActorContext {
  personId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

function fullName(firstName: string, lastName: string | null): string {
  return [firstName, lastName].filter(Boolean).join(' ');
}

const FAILURE_MESSAGES: Record<string, string> = {
  STUDENT_NOT_FOUND: 'Student not found.',
  WALLET_NOT_FOUND: 'This student has no canteen wallet set up.',
  WALLET_FROZEN: 'This student’s wallet is frozen and cannot be charged.',
  INSUFFICIENT_BALANCE: 'Insufficient wallet balance for this amount.',
};

@Injectable()
export class CanteenService {
  constructor(
    private readonly repo: CanteenRepository,
    private readonly uow: UnitOfWork,
    private readonly audit: AuditService,
  ) {}

  async searchStudents(query: string) {
    const trimmed = query.trim();
    if (trimmed.length < 2) return [];
    const rows = await this.repo.searchStudents(trimmed);
    return rows.map((r) => ({
      id: r.id,
      name: fullName(r.firstName, r.lastName),
      admissionNo: r.admissionNo,
      gradeName: r.gradeName,
      sectionName: r.sectionName,
      hasWallet: r.walletId !== null,
      walletActive: r.walletStatus === 'ACTIVE',
      balancePaise: r.balancePaise !== null ? Number(r.balancePaise) : null,
    }));
  }

  async charge(dto: ChargeWalletDto, actor: CanteenActorContext) {
    try {
      return await this.uow.run(async (client) => {
        // Re-checked here, inside this exact transaction, right before the
        // debit -- not trusted from an earlier, separate lookup -- so a
        // student who went inactive between being searched and being
        // charged can't slip a charge through a stale check.
        const student = await this.repo.getStudentBasicInfo(
          dto.studentId,
          client,
        );
        if (!student) throw new Error('STUDENT_NOT_FOUND');

        const result = await this.repo.chargeWallet(
          {
            studentId: dto.studentId,
            amountPaise: dto.amountPaise,
            performedBy: actor.personId,
            idempotencyKey: dto.idempotencyKey,
          },
          client,
        );

        await this.audit.record(
          {
            actorPersonId: actor.personId,
            actorRoleCode: 'CANTEEN_VENDOR',
            action: result.replayed
              ? 'CANTEEN_WALLET_CHARGE_REPLAYED'
              : 'CANTEEN_WALLET_CHARGED',
            objectType: 'canteen_transaction',
            objectId: result.transactionId,
            outcome: 'SUCCESS',
            ipAddress: actor.ipAddress,
            userAgent: actor.userAgent,
            correlationId: dto.idempotencyKey,
            afterData: {
              studentId: dto.studentId,
              admissionNo: student.admissionNo,
              amountPaise: dto.amountPaise,
              balanceAfterPaise: result.balanceAfterPaise,
            },
          },
          client,
        );

        return {
          transactionId: result.transactionId,
          studentId: student.id,
          studentName: fullName(student.firstName, student.lastName),
          admissionNo: student.admissionNo,
          amountPaise: dto.amountPaise,
          balanceAfterPaise: Number(result.balanceAfterPaise),
          createdAt: result.createdAt,
        };
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'UNEXPECTED_ERROR';
      const httpMessage = FAILURE_MESSAGES[reason];

      // Never let an audit-write failure hide the real error from the
      // caller -- best-effort, swallowed on its own.
      await this.audit
        .record({
          actorPersonId: actor.personId,
          actorRoleCode: 'CANTEEN_VENDOR',
          action: 'CANTEEN_WALLET_CHARGE_FAILED',
          objectType: 'canteen_transaction',
          objectId: null,
          outcome: 'DENIED',
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
          correlationId: dto.idempotencyKey,
          afterData: {
            studentId: dto.studentId,
            amountPaise: dto.amountPaise,
            reason: httpMessage ? reason : 'UNEXPECTED_ERROR',
          },
        })
        .catch(() => {});

      if (reason === 'STUDENT_NOT_FOUND' || reason === 'WALLET_NOT_FOUND') {
        throw new NotFoundException(httpMessage);
      }
      if (reason === 'WALLET_FROZEN' || reason === 'INSUFFICIENT_BALANCE') {
        throw new BadRequestException(httpMessage);
      }
      throw err;
    }
  }

  async listHistory(limit: number, offset: number) {
    const rows = await this.repo.listHistory(limit, offset);
    return rows.map(mapHistoryRow);
  }

  /** Every number here is a real aggregate off canteen_transaction (and,
   * for declinedToday, the same audit_event rows every failed charge
   * writes -- see charge()'s own header comment) as of the moment this is
   * called -- nothing cached, nothing estimated. See
   * canteen.repository.ts's own getWeeklySalesTrend/getTodayHourlySales
   * comments for why both series are always a fixed length (7 days / 13
   * hours) with real zeros, not sparse.
   *
   * Three additions beyond the raw totals, each answering a real question
   * a counter vendor actually has, not just "more charts": salesDeltaPct/
   * transactionsDeltaPct (is today better or worse than yesterday, the one
   * comparison a single day's raw number can't answer on its own),
   * peakHour (when to expect the rush, straight off the same hourly series
   * already being fetched -- no extra query), and gradeBreakdown/
   * declinedToday (what to stock, and how many students tried to buy and
   * couldn't -- a real friction signal nothing else here surfaces). */
  async getDashboard() {
    const [
      today,
      yesterday,
      weeklyRows,
      hourlyRows,
      gradeRows,
      declinedToday,
      recentRows,
    ] = await Promise.all([
      this.repo.getDaySummary(0),
      this.repo.getDaySummary(1),
      this.repo.getWeeklySalesTrend(),
      this.repo.getTodayHourlySales(),
      this.repo.getGradeBreakdownToday(),
      this.repo.getDeclinedCountToday(),
      this.repo.listHistory(8, 0),
    ]);

    const todaySalesPaise = Number(today.salesPaise);
    const todayTransactionCount = today.transactionCount;
    const yesterdaySalesPaise = Number(yesterday.salesPaise);
    const yesterdayTransactionCount = yesterday.transactionCount;

    const hourlyToday = hourlyRows.map((r) => ({
      hour: r.hour,
      totalPaise: Number(r.totalPaise),
    }));
    const peak = hourlyToday.reduce(
      (best, r) => (r.totalPaise > best.totalPaise ? r : best),
      hourlyToday[0],
    );

    const gradeTotals = gradeRows.map((r) => ({
      gradeName: r.gradeName ?? 'Unassigned',
      totalPaise: Number(r.totalPaise),
    }));
    const TOP_GRADES = 5;
    const gradeBreakdown = gradeTotals.slice(0, TOP_GRADES);
    const otherGrades = gradeTotals.slice(TOP_GRADES);
    if (otherGrades.length > 0) {
      gradeBreakdown.push({
        gradeName: 'Other',
        totalPaise: otherGrades.reduce((sum, g) => sum + g.totalPaise, 0),
      });
    }

    return {
      todaySalesPaise,
      todayTransactionCount,
      todayUniqueStudents: today.uniqueStudents,
      todayAvgTransactionPaise:
        todayTransactionCount > 0
          ? Math.round(todaySalesPaise / todayTransactionCount)
          : 0,
      salesDeltaPct: percentDelta(todaySalesPaise, yesterdaySalesPaise),
      transactionsDeltaPct: percentDelta(
        todayTransactionCount,
        yesterdayTransactionCount,
      ),
      peakHour: peak && peak.totalPaise > 0 ? peak.hour : null,
      declinedToday,
      weeklyTrend: weeklyRows.map((r) => ({
        date: r.day,
        totalPaise: Number(r.totalPaise),
      })),
      hourlyToday,
      gradeBreakdown,
      recentTransactions: recentRows.map(mapHistoryRow),
    };
  }
}

/** null when yesterday's figure was 0 -- "infinite % increase" is not a
 * real number to show a vendor, so the frontend shows "new" instead of a
 * delta in that case. */
function percentDelta(today: number, yesterday: number): number | null {
  if (yesterday <= 0) return null;
  return Math.round(((today - yesterday) / yesterday) * 100);
}

function mapHistoryRow(r: CanteenHistoryRow) {
  return {
    id: r.id,
    studentId: r.studentId,
    studentName: fullName(r.firstName, r.lastName),
    admissionNo: r.admissionNo,
    gradeName: r.gradeName,
    sectionName: r.sectionName,
    amountPaise: Number(r.amountPaise),
    balanceAfterPaise: Number(r.balanceAfterPaise),
    createdAt: r.createdAt,
    performedByName:
      r.performedByFirstName !== null
        ? fullName(r.performedByFirstName, r.performedByLastName)
        : null,
  };
}
