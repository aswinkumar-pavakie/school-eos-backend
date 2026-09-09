// Faculty's own "Student Attendance" -- a class advisor's daily roll call for
// their own section, and nothing else: a subject teacher who is NOT the
// advisor for a section can never mark attendance there (the user's own
// explicit rule). Reuses the exact same tables/auto-seed pattern the existing
// ADMIN-only attendance module already uses (attendance_session/
// attendance_record), and the same locked-session correction path
// (AttendanceRecordsService.update/correct, both already exported) rather than
// re-deriving that branching here.

import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { Queryable } from '../../infrastructure/postgres/postgres.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { AttendanceRecordsService } from '../attendance/attendance-records.service';
import { AttendanceCorrectionRepository } from '../attendance/repositories/attendance-correction.repository';
import { AttendanceRecordRepository, AttendanceRecordWithStudent } from '../attendance/repositories/attendance-record.repository';
import { AttendanceSessionRepository, AttendanceSessionRow } from '../attendance/repositories/attendance-session.repository';
import { MarkAttendanceRecordDto } from './dto/mark-attendance-record.dto';
import { FacultyScopeRepository } from './repositories/faculty-scope.repository';

export interface AttendanceRoster {
  session: AttendanceSessionRow;
  records: AttendanceRecordWithStudent[];
}

@Injectable()
export class FacultyAttendanceService {
  constructor(
    private readonly scopeRepo: FacultyScopeRepository,
    private readonly sessionRepo: AttendanceSessionRepository,
    private readonly recordRepo: AttendanceRecordRepository,
    private readonly correctionRepo: AttendanceCorrectionRepository,
    private readonly recordsService: AttendanceRecordsService,
    private readonly unitOfWork: UnitOfWork,
    private readonly audit: AuditService,
  ) {}

  async assertAdvisor(personId: string, sectionId: string): Promise<void> {
    const isAdvisor = await this.scopeRepo.isAdvisorForSection(personId, sectionId);
    if (!isAdvisor) {
      throw new ForbiddenException('You are only able to mark attendance for a class you are the class advisor of.');
    }
  }

  /** Finds today's (or any date's) session for this section, creating it
   * (seeded PRESENT for every actively-enrolled student, same as the existing
   * admin flow) the first time it's opened for that date. */
  async getOrCreateRoster(personId: string, sectionId: string, date: string): Promise<AttendanceRoster> {
    await this.assertAdvisor(personId, sectionId);
    return this.unitOfWork.run(async (client) => {
      let session = await this.sessionRepo.findBySectionAndDate(sectionId, date, client);
      if (!session) {
        session = await this.sessionRepo.create(sectionId, date, client);
        const studentIds = await this.sessionRepo.findActiveEnrolledStudentIds(sectionId, client);
        await this.recordRepo.createManyPresent(session.id, studentIds, client);
        await this.audit.record(
          {
            actorPersonId: personId,
            actorRoleCode: 'FACULTY',
            action: 'FACULTY_ATTENDANCE_SESSION_OPENED',
            objectType: 'attendance_session',
            objectId: session.id,
            outcome: 'SUCCESS',
            afterData: { ...session, rosterSize: studentIds.length },
          },
          client,
        );
      }
      const records = await this.recordRepo.findBySessionId(session.id, sectionId, client);
      return { session, records };
    });
  }

  private async assertRecordInSection(recordId: string, sectionId: string, client?: Queryable) {
    const record = await this.recordRepo.findById(recordId, client);
    if (!record) throw new NotFoundException('Attendance record not found');
    const session = await this.sessionRepo.findById(record.sessionId, client);
    if (!session || session.sectionId !== sectionId) throw new NotFoundException('Attendance record not found');
    return { record, session };
  }

  async markRecord(personId: string, sectionId: string, recordId: string, dto: MarkAttendanceRecordDto) {
    await this.assertAdvisor(personId, sectionId);
    const { session } = await this.assertRecordInSection(recordId, sectionId);
    if (session.isLocked) {
      return this.recordsService.correct(recordId, { newStatus: dto.status, reason: dto.reason ?? 'Corrected by class advisor' }, personId);
    }
    return this.recordsService.update(recordId, { status: dto.status, reason: dto.reason }, personId);
  }

  /** Resets every non-present record in today's roster back to PRESENT --
   * "Mark all present" in the design. */
  async markAllPresent(personId: string, sectionId: string, date: string) {
    await this.assertAdvisor(personId, sectionId);
    const { session, records } = await this.getOrCreateRoster(personId, sectionId, date);
    for (const record of records) {
      if (record.status === 'PRESENT') continue;
      if (session.isLocked) {
        await this.recordsService.correct(record.id, { newStatus: 'PRESENT', reason: 'Marked all present' }, personId);
      } else {
        await this.recordsService.update(record.id, { status: 'PRESENT' }, personId);
      }
    }
    return this.getOrCreateRoster(personId, sectionId, date);
  }

  /** Real month-by-month calendar data for the "Past records" panel -- one
   * summary row per session actually held that month. */
  async getHistory(personId: string, sectionId: string, monthStart: string, monthEnd: string) {
    await this.assertAdvisor(personId, sectionId);
    const { rows: sessions } = await this.sessionRepo.findMany({ sectionId, dateFrom: monthStart, dateTo: monthEnd, limit: 62, offset: 0 });
    const days = [];
    for (const session of sessions) {
      const records = await this.recordRepo.findBySessionId(session.id, sectionId);
      const present = records.filter((r) => r.status === 'PRESENT' || r.status === 'LATE' || r.status === 'HALF_DAY').length;
      const absent = records.filter((r) => r.status === 'ABSENT').length;
      const onLeave = records.filter((r) => r.status === 'ON_LEAVE').length;
      days.push({
        sessionId: session.id,
        date: session.sessionDate,
        total: records.length,
        present,
        absent,
        onLeave,
        absentees: records.filter((r) => r.status === 'ABSENT').map((r) => ({ studentId: r.studentId, firstName: r.firstName, lastName: r.lastName, rollNo: r.rollNo })),
      });
    }
    return days;
  }

  /** Shared "approving leave/OD auto-marks the attendance record" rule --
   * called by the student-leave (and, later, staff-leave/OD) approval
   * handlers, inside the SAME transaction the generic approvals engine already
   * runs the decision in. Finds-or-creates the day's session exactly like the
   * normal marking flow above, then sets this one student's record, using a
   * correction if the session already happens to be locked. */
  async ensureSessionAndMarkStatus(
    params: { sectionId: string; date: string; studentId: string; status: string; reason: string; actorPersonId: string },
    client: Queryable,
  ): Promise<void> {
    let session = await this.sessionRepo.findBySectionAndDate(params.sectionId, params.date, client);
    if (!session) {
      session = await this.sessionRepo.create(params.sectionId, params.date, client);
      const studentIds = await this.sessionRepo.findActiveEnrolledStudentIds(params.sectionId, client);
      await this.recordRepo.createManyPresent(session.id, studentIds, client);
    }
    const record = await this.recordRepo.findBySessionAndStudent(session.id, params.studentId, client);
    if (!record) {
      await this.recordRepo.createOne(session.id, params.studentId, params.status, params.reason, client);
      return;
    }
    if (record.status === params.status) return;
    if (session.isLocked) {
      await this.correctionRepo.create(
        { attendanceRecordId: record.id, oldStatus: record.status, newStatus: params.status, reason: params.reason, correctedBy: params.actorPersonId },
        client,
      );
    } else {
      await this.recordRepo.updateStatus(record.id, params.status, params.reason, client);
    }
  }
}
