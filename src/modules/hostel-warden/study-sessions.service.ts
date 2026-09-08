// PENDING FEATURE -- see HostelWardenPendingModule for why this isn't wired into
// AppModule yet (hostel_study_session/hostel_study_attendance don't exist as real
// tables until a migration runs; see query.md).

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { HOSTEL_WARDEN_ERRORS } from '../../common/errors/error-codes';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { CreateStudySessionDto } from './dto/create-study-session.dto';
import { MarkStudyAttendanceDto } from './dto/mark-study-attendance.dto';
import { HostelStudyAttendanceRepository } from './repositories/hostel-study-attendance.repository';
import { HostelStudySessionRepository } from './repositories/hostel-study-session.repository';
import { StudentHostelRepository } from './repositories/student-hostel.repository';
import { WardenContextService } from './warden-context.service';

@Injectable()
export class StudySessionsService {
  constructor(
    private readonly wardenContext: WardenContextService,
    private readonly sessionRepo: HostelStudySessionRepository,
    private readonly attendanceRepo: HostelStudyAttendanceRepository,
    private readonly studentHostelRepo: StudentHostelRepository,
    private readonly auditService: AuditService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async list(personId: string) {
    const ctx = await this.wardenContext.requireActiveWarden(personId);
    return this.sessionRepo.findMany(ctx.hostelIds);
  }

  private resolveHostelId(
    hostelIds: string[],
    requested: string | undefined,
  ): string {
    if (requested) {
      if (!hostelIds.includes(requested)) {
        throw new ForbiddenException(HOSTEL_WARDEN_ERRORS.NOT_WARDEN);
      }
      return requested;
    }
    return hostelIds[0];
  }

  async create(dto: CreateStudySessionDto, personId: string) {
    const ctx = await this.wardenContext.requireActiveWarden(personId);
    const hostelId = this.resolveHostelId(ctx.hostelIds, dto.hostelId);

    // Checked here, not left to hostel_study_session's own DB CHECK constraint --
    // that constraint exists as a last-resort guarantee, but letting it be the
    // only thing catching this meant an invalid range surfaced as a raw
    // unhandled 500 instead of a clean validation error (found via live E2E
    // testing).
    if (dto.startTime >= dto.endTime) {
      throw new BadRequestException('endTime must be after startTime');
    }

    const session = await this.sessionRepo.create({
      hostelId,
      sessionDate: dto.sessionDate,
      startTime: dto.startTime,
      endTime: dto.endTime,
      createdByStaffId: ctx.staffId,
    });

    await this.auditService.record({
      actorPersonId: personId,
      actorRoleCode: 'HOSTEL_WARDEN',
      action: 'HOSTEL_STUDY_SESSION_CREATED',
      objectType: 'hostel_study_session',
      objectId: session.id,
      outcome: 'SUCCESS',
      afterData: session,
    });

    return session;
  }

  private async getScopedSession(id: string, hostelIds: string[]) {
    const session = await this.sessionRepo.findById(id);
    if (!session || !hostelIds.includes(session.hostelId)) {
      throw new NotFoundException(HOSTEL_WARDEN_ERRORS.STUDY_SESSION_NOT_FOUND);
    }
    return session;
  }

  async getRoster(sessionId: string, personId: string) {
    const ctx = await this.wardenContext.requireActiveWarden(personId);
    const session = await this.getScopedSession(sessionId, ctx.hostelIds);
    return {
      session,
      roster: await this.attendanceRepo.findRoster(sessionId, session.hostelId),
    };
  }

  async mark(sessionId: string, dto: MarkStudyAttendanceDto, personId: string) {
    const ctx = await this.wardenContext.requireActiveWarden(personId);
    const session = await this.getScopedSession(sessionId, ctx.hostelIds);
    if (session.isLocked) {
      throw new ConflictException(HOSTEL_WARDEN_ERRORS.STUDY_SESSION_LOCKED);
    }

    // Every entry's student must actually belong to this session's own hostel --
    // otherwise a Warden could mark study attendance for a student outside their
    // hostel purely by naming a studentId not present in the session's own roster
    // (the roster itself is correctly scoped; only ad-hoc mark bodies needed this
    // check too). Resolved before the transaction, same pattern as Night Attendance.
    for (const entry of dto.entries) {
      const hostelId =
        await this.studentHostelRepo.findActiveHostelIdForStudent(
          entry.studentId,
          [session.hostelId],
        );
      if (!hostelId) {
        throw new NotFoundException(HOSTEL_WARDEN_ERRORS.STUDENT_NOT_IN_HOSTEL);
      }
    }

    await this.unitOfWork.run(async (client) => {
      for (const entry of dto.entries) {
        await this.attendanceRepo.upsert(
          {
            sessionId,
            studentId: entry.studentId,
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
          action: 'HOSTEL_STUDY_ATTENDANCE_MARKED',
          objectType: 'hostel_study_session',
          objectId: sessionId,
          outcome: 'SUCCESS',
          afterData: { entries: dto.entries },
        },
        client,
      );
    });

    return { marked: dto.entries.length };
  }
}
