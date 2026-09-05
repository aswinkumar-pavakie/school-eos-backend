import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { AttendanceSessionQueryDto } from './dto/attendance-session-query.dto';
import { CreateAttendanceSessionDto } from './dto/create-attendance-session.dto';
import { isUniqueViolation } from './pg-error.util';
import { AttendanceRecordRepository } from './repositories/attendance-record.repository';
import { AttendanceSessionRepository } from './repositories/attendance-session.repository';

@Injectable()
export class AttendanceSessionsService {
  constructor(
    private readonly sessionRepo: AttendanceSessionRepository,
    private readonly recordRepo: AttendanceRecordRepository,
    private readonly auditService: AuditService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async list(query: AttendanceSessionQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const { rows, total } = await this.sessionRepo.findMany({
      sectionId: query.sectionId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      limit,
      offset: (page - 1) * limit,
    });
    return { data: rows, meta: { page, limit, total } };
  }

  async get(id: string) {
    const session = await this.sessionRepo.findById(id);
    if (!session) throw new NotFoundException('Attendance session not found');
    const records = await this.recordRepo.findBySessionId(id, session.sectionId);
    const counts: Record<string, number> = {
      PRESENT: 0,
      ABSENT: 0,
      LATE: 0,
      ON_LEAVE: 0,
      HALF_DAY: 0,
    };
    for (const record of records) {
      counts[record.status] = (counts[record.status] ?? 0) + 1;
    }
    return { ...session, records, counts };
  }

  /** Seeds one PRESENT record per active-enrolled student -- "mark all present, then
   * correct the exceptions". An empty roster is a valid (if unusual) state, not an
   * error. */
  async create(dto: CreateAttendanceSessionDto, actorPersonId: string) {
    try {
      return await this.unitOfWork.run(async (client) => {
        const session = await this.sessionRepo.create(dto.sectionId, dto.sessionDate, client);
        const studentIds = await this.sessionRepo.findActiveEnrolledStudentIds(dto.sectionId, client);
        await this.recordRepo.createManyPresent(session.id, studentIds, client);

        await this.auditService.record(
          {
            actorPersonId,
            action: 'ATTENDANCE_SESSION_CREATED',
            objectType: 'attendance_session',
            objectId: session.id,
            outcome: 'SUCCESS',
            afterData: { ...session, rosterSize: studentIds.length },
          },
          client,
        );

        return { ...session, rosterSize: studentIds.length };
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          'An attendance session already exists for this section and date.',
        );
      }
      throw err;
    }
  }

  async lock(id: string, actorPersonId: string) {
    const session = await this.sessionRepo.findById(id);
    if (!session) throw new NotFoundException('Attendance session not found');
    if (session.isLocked) {
      throw new ConflictException('This session is already locked.');
    }

    const locked = await this.sessionRepo.lock(id, actorPersonId);
    if (!locked) throw new ConflictException('This session is already locked.');

    await this.auditService.record({
      actorPersonId,
      action: 'ATTENDANCE_SESSION_LOCKED',
      objectType: 'attendance_session',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: session,
      afterData: locked,
    });

    return locked;
  }
}
