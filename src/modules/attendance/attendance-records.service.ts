import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { CorrectAttendanceRecordDto } from './dto/correct-attendance-record.dto';
import { UpdateAttendanceRecordDto } from './dto/update-attendance-record.dto';
import { AttendanceCorrectionRepository } from './repositories/attendance-correction.repository';
import { AttendanceRecordRepository } from './repositories/attendance-record.repository';
import { AttendanceSessionRepository } from './repositories/attendance-session.repository';

@Injectable()
export class AttendanceRecordsService {
  constructor(
    private readonly recordRepo: AttendanceRecordRepository,
    private readonly sessionRepo: AttendanceSessionRepository,
    private readonly correctionRepo: AttendanceCorrectionRepository,
    private readonly auditService: AuditService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  private async getRecordAndSession(id: string) {
    const record = await this.recordRepo.findById(id);
    if (!record) throw new NotFoundException('Attendance record not found');
    const session = await this.sessionRepo.findById(record.sessionId);
    if (!session) throw new NotFoundException('Attendance session not found');
    return { record, session };
  }

  /** Direct edit -- only while the session is still unlocked. Once locked, this
   * rejects with a clean 409 pointing at the correction endpoint instead. */
  async update(id: string, dto: UpdateAttendanceRecordDto, actorPersonId: string) {
    const { record, session } = await this.getRecordAndSession(id);
    if (session.isLocked) {
      throw new ConflictException(
        'This session is locked — use the correction endpoint to change a record after locking.',
      );
    }

    const updated = await this.recordRepo.updateStatus(id, dto.status, dto.reason);
    if (!updated) throw new NotFoundException('Attendance record not found');

    await this.auditService.record({
      actorPersonId,
      action: 'ATTENDANCE_RECORD_UPDATED',
      objectType: 'attendance_record',
      objectId: id,
      outcome: 'SUCCESS',
      beforeData: record,
      afterData: updated,
    });

    return updated;
  }

  /** The only way to change a record's *effective* status once its session is
   * locked. A DB trigger (guard_locked_attendance) unconditionally rejects any direct
   * UPDATE to attendance_record.status once its session is locked -- there is no
   * exception for pairing it with a correction insert in the same transaction. So
   * this never touches the base row at all: it only inserts into
   * attendance_correction, and every read of a record's status (see
   * AttendanceRecordRepository's COLUMNS) derives the effective value from the most
   * recent correction, falling back to the frozen base status when none exists yet.
   * Rejects with 400 if the session isn't locked yet (corrections are the post-lock
   * path, not a replacement for the normal edit while still open). */
  async correct(id: string, dto: CorrectAttendanceRecordDto, actorPersonId: string) {
    const { record, session } = await this.getRecordAndSession(id);
    if (!session.isLocked) {
      throw new BadRequestException(
        "This session isn't locked yet — edit the record directly instead of correcting it.",
      );
    }

    return this.unitOfWork.run(async (client) => {
      const correction = await this.correctionRepo.create(
        {
          attendanceRecordId: id,
          oldStatus: record.status,
          newStatus: dto.newStatus,
          reason: dto.reason,
          correctedBy: actorPersonId,
        },
        client,
      );

      const updated = await this.recordRepo.findById(id, client);
      if (!updated) throw new NotFoundException('Attendance record not found');

      await this.auditService.record(
        {
          actorPersonId,
          action: 'ATTENDANCE_RECORD_CORRECTED',
          objectType: 'attendance_record',
          objectId: id,
          outcome: 'SUCCESS',
          beforeData: record,
          afterData: { record: updated, correction },
        },
        client,
      );

      return { record: updated, correction };
    });
  }

  async listCorrections(id: string) {
    const record = await this.recordRepo.findById(id);
    if (!record) throw new NotFoundException('Attendance record not found');
    return this.correctionRepo.findByRecordId(id);
  }

  async getAttendanceSummaryForStudent(studentId: string) {
    const { presentCount, totalCount } = await this.recordRepo.getAttendanceSummaryForStudent(studentId);
    return {
      presentCount,
      totalCount,
      percentage: totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : null,
    };
  }
}
