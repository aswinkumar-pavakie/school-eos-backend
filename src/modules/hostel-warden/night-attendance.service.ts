import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { HOSTEL_WARDEN_ERRORS } from '../../common/errors/error-codes';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { MarkNightAttendanceDto } from './dto/mark-night-attendance.dto';
import { HostelAttendanceRepository } from './repositories/hostel-attendance.repository';
import { StudentHostelRepository } from './repositories/student-hostel.repository';
import { WardenContextService } from './warden-context.service';

@Injectable()
export class NightAttendanceService {
  constructor(
    private readonly wardenContext: WardenContextService,
    private readonly attendanceRepo: HostelAttendanceRepository,
    private readonly studentHostelRepo: StudentHostelRepository,
    private readonly auditService: AuditService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async getRoster(personId: string, date: string) {
    const ctx = await this.wardenContext.requireActiveWarden(personId);
    return this.attendanceRepo.findRoster(ctx.hostelIds, date);
  }

  /** Every entry's hostel-membership is resolved and checked BEFORE any write, so a
   * batch either commits together or fails together with a real audited denial --
   * never a partial write with a missing audit trail for the entries that happened to
   * come first in the array. */
  async mark(dto: MarkNightAttendanceDto, personId: string) {
    const ctx = await this.wardenContext.requireActiveWarden(personId);

    const resolved: Array<{
      studentId: string;
      hostelId: string;
      status: string;
    }> = [];
    for (const entry of dto.entries) {
      const hostelId =
        await this.studentHostelRepo.findActiveHostelIdForStudent(
          entry.studentId,
          ctx.hostelIds,
        );
      if (!hostelId) {
        await this.auditService.record({
          actorPersonId: personId,
          actorRoleCode: 'HOSTEL_WARDEN',
          action: 'HOSTEL_NIGHT_ATTENDANCE_DENIED',
          objectType: 'hostel_attendance',
          objectId: entry.studentId,
          outcome: 'DENIED',
          afterData: {
            reason: HOSTEL_WARDEN_ERRORS.STUDENT_NOT_IN_HOSTEL,
            date: dto.date,
          },
        });
        // 404, not 403 -- matches the project's "not found vs not yours both 404"
        // convention for out-of-scope objects (verified live: a cross-hostel
        // student must read the same as a nonexistent one, never distinguishable).
        throw new NotFoundException(HOSTEL_WARDEN_ERRORS.STUDENT_NOT_IN_HOSTEL);
      }
      resolved.push({
        studentId: entry.studentId,
        hostelId,
        status: entry.status,
      });
    }

    await this.unitOfWork.run(async (client) => {
      for (const entry of resolved) {
        await this.attendanceRepo.upsert(
          {
            studentId: entry.studentId,
            hostelId: entry.hostelId,
            date: dto.date,
            status: entry.status,
            recordedBy: personId,
          },
          client,
        );
      }
      await this.auditService.record(
        {
          actorPersonId: personId,
          actorRoleCode: 'HOSTEL_WARDEN',
          action: 'HOSTEL_NIGHT_ATTENDANCE_MARKED',
          objectType: 'hostel_attendance',
          objectId: dto.date,
          outcome: 'SUCCESS',
          afterData: { date: dto.date, entries: dto.entries },
        },
        client,
      );
    });

    return { marked: resolved.length, date: dto.date };
  }
}
