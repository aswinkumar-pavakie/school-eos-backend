// Class Absence Alert: CLASS ATTENDANCE (owned by the Attendance module, read-only
// here, never written) x HOSTEL PRESENCE (an ACTIVE hostel_allocation) -> an alert to
// the student's guardians. Generation is idempotent (dedup-checked against the shared
// `notification` table before enqueueing) so calling the listing endpoint repeatedly
// for the same date never sends a second alert for the same absence.

import { Injectable } from '@nestjs/common';
import { AttendanceRecordsService } from '../attendance/attendance-records.service';
import { AuditService } from '../../common/audit/audit.service';
import { OutboxService } from '../../common/outbox/outbox.service';
import { ClassAbsenceAlertRepository } from './repositories/class-absence-alert.repository';
import { WardenContextService } from './warden-context.service';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

@Injectable()
export class ClassAbsenceAlertsService {
  constructor(
    private readonly wardenContext: WardenContextService,
    private readonly alertRepo: ClassAbsenceAlertRepository,
    private readonly attendanceRecordsService: AttendanceRecordsService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  async listAlerts(personId: string, date: string | undefined) {
    const ctx = await this.wardenContext.requireActiveWarden(personId);
    const effectiveDate = date ?? todayIso();

    const students = await this.alertRepo.findActiveStudentsForHostels(
      ctx.hostelIds,
    );
    const studentIds = students.map((s) => s.studentId);
    const absentRows =
      await this.attendanceRecordsService.findAbsentStudentIdsForDate(
        studentIds,
        effectiveDate,
      );

    if (absentRows.length > 0) {
      const covered =
        await this.alertRepo.findStudentIdsWithApprovedOutingCoveringDate(
          absentRows.map((r) => r.studentId),
          effectiveDate,
        );
      const candidates = absentRows.filter((r) => !covered.has(r.studentId));
      const alreadyAlerted = await this.alertRepo.findRecordIdsAlreadyAlerted(
        candidates.map((c) => c.recordId),
      );
      const newCandidates = candidates.filter(
        (c) => !alreadyAlerted.has(c.recordId),
      );

      for (const candidate of newCandidates) {
        const student = students.find(
          (s) => s.studentId === candidate.studentId,
        );
        const studentName = student
          ? [student.firstName, student.lastName].filter(Boolean).join(' ')
          : 'Student';
        const guardianPersonIds =
          await this.alertRepo.findActiveGuardianPersonIds(candidate.studentId);

        for (const guardianPersonId of guardianPersonIds) {
          await this.outbox.enqueue({
            personId: guardianPersonId,
            aboutStudentId: candidate.studentId,
            notificationType: 'HOSTEL_CLASS_ABSENCE_ALERT',
            title: 'Class absence alert',
            body: `${studentName} was marked absent in class on ${effectiveDate}, but hostel records show them as a resident student.`,
            relatedObjectType: 'attendance_record',
            relatedObjectId: candidate.recordId,
          });
        }

        await this.audit.record({
          actorPersonId: personId,
          actorRoleCode: 'HOSTEL_WARDEN',
          action: 'HOSTEL_CLASS_ABSENCE_ALERT_GENERATED',
          objectType: 'attendance_record',
          objectId: candidate.recordId,
          outcome: 'SUCCESS',
          afterData: {
            studentId: candidate.studentId,
            date: effectiveDate,
            guardianCount: guardianPersonIds.length,
          },
        });
      }
    }

    return this.alertRepo.listAlertsForHostels(ctx.hostelIds, effectiveDate);
  }
}
