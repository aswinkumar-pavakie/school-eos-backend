import { Injectable } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { MarkStaffAttendanceDto } from './dto/mark-staff-attendance.dto';
import { StaffAttendanceQueryDto } from './dto/staff-attendance-query.dto';
import { StaffAttendanceRepository } from './repositories/staff-attendance.repository';

@Injectable()
export class StaffAttendanceService {
  constructor(
    private readonly staffAttendanceRepo: StaffAttendanceRepository,
    private readonly auditService: AuditService,
  ) {}

  getDailyRoster(query: StaffAttendanceQueryDto) {
    return this.staffAttendanceRepo.findDailyRoster(query.date, {
      isTeaching:
        query.isTeaching === undefined
          ? undefined
          : query.isTeaching === 'true',
      gradeId: query.gradeId,
      sectionId: query.sectionId,
      subjectId: query.subjectId,
    });
  }

  async getAttendanceSummaryForStaff(staffId: string) {
    const { presentCount, totalCount } =
      await this.staffAttendanceRepo.getAttendanceSummaryForStaff(staffId);
    return {
      presentCount,
      totalCount,
      percentage:
        totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : null,
    };
  }

  /** The caller's own attendance history for one calendar month (defaults to
   * the current month), plus that month's counts and the existing lifetime
   * summary alongside it -- self-scoped to the staffId the controller
   * resolved from the authenticated actor, never a client-supplied one. */
  async getMyAttendanceHistory(staffId: string, month?: string) {
    const effectiveMonth = month ?? new Date().toISOString().slice(0, 7);
    const [days, monthlySummary, allTimeCounts] = await Promise.all([
      this.staffAttendanceRepo.findEventsForStaff(staffId, effectiveMonth),
      this.staffAttendanceRepo.getAttendanceSummaryForStaffInMonth(
        staffId,
        effectiveMonth,
      ),
      this.staffAttendanceRepo.getAttendanceSummaryForStaff(staffId),
    ]);
    const withPercentage = (c: {
      presentCount: number;
      totalCount: number;
    }) => ({
      ...c,
      percentage:
        c.totalCount > 0
          ? Math.round((c.presentCount / c.totalCount) * 100)
          : null,
    });
    return {
      month: effectiveMonth,
      monthlySummary: withPercentage(monthlySummary),
      allTimeSummary: withPercentage(allTimeCounts),
      days,
    };
  }

  /** Real stat-row summary for a given date (design-reframe addition) --
   * marked/present/absent/on-leave today plus the school-wide month average,
   * all real aggregates, no fabricated "corrections open" concept (staff
   * attendance has no correction/dispute table -- that exists only for
   * student class-attendance sessions, a different module). */
  async getDailySummary(date: string) {
    const month = date.slice(0, 7);
    const [today, monthSummary] = await Promise.all([
      this.staffAttendanceRepo.getDailySummary(date),
      this.staffAttendanceRepo.getMonthSummary(month),
    ]);
    return {
      total: today.total,
      present: today.present,
      absent: today.absent,
      onLeave: today.onLeave,
      monthAveragePercent:
        monthSummary.total > 0
          ? Math.round((monthSummary.present / monthSummary.total) * 100)
          : null,
    };
  }

  async markBulk(dto: MarkStaffAttendanceDto, actorPersonId: string) {
    const eventType = dto.status === 'PRESENT' ? 'CHECK_IN' : 'ABSENT';
    // A fixed representative time for the day (9 AM) -- this is a whole-day
    // manual mark, not a real device timestamp, so there's no more precise time
    // to record; occurred_at just needs to fall on the right calendar date.
    const occurredAt = `${dto.date}T09:00:00Z`;

    await this.staffAttendanceRepo.markMany(
      dto.staffIds.map((staffId) => ({
        staffId,
        eventType: eventType as 'CHECK_IN' | 'ABSENT',
        occurredAt,
        reason: dto.reason,
        recordedBy: actorPersonId,
      })),
    );

    await this.auditService.record({
      actorPersonId,
      action: 'STAFF_ATTENDANCE_MARKED',
      objectType: 'staff_attendance_event',
      objectId: dto.date,
      outcome: 'SUCCESS',
      afterData: {
        staffIds: dto.staffIds,
        date: dto.date,
        status: dto.status,
        reason: dto.reason,
      },
    });

    return { marked: dto.staffIds.length, status: dto.status };
  }
}
