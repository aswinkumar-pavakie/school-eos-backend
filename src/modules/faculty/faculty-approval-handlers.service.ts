// Registers the Faculty module's subject_object_type handlers with the
// generic approvals engine (see modules/approvals/subject-state.registry.ts),
// exactly the same seam FinanceApprovalHandlers already uses for refund/
// concession/purchase_request/etc. This is what makes "class advisor approves
// via the normal /approvals/:id/approve endpoint" actually flip
// student_leave_request's own state AND auto-mark the student's attendance --
// the generic engine itself knows nothing about either table.

import { Injectable, OnModuleInit } from '@nestjs/common';
import { simpleStateColumnHandler, SubjectStateRegistry } from '../approvals/subject-state.registry';
import { StaffAttendanceRepository } from '../staff-attendance/repositories/staff-attendance.repository';
import { FacultyAttendanceService } from './faculty-attendance.service';
import { StaffAppraisalRepository } from './repositories/staff-appraisal.repository';
import { StaffLeaveRequestRepository } from './repositories/staff-leave-request.repository';
import { StudentLeaveRequestRepository } from './repositories/student-leave-request.repository';

function* eachDate(fromDate: string, toDate: string): Generator<string> {
  const cursor = new Date(fromDate + 'T00:00:00Z');
  const end = new Date(toDate + 'T00:00:00Z');
  while (cursor.getTime() <= end.getTime()) {
    yield cursor.toISOString().slice(0, 10);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}

@Injectable()
export class FacultyApprovalHandlers implements OnModuleInit {
  constructor(
    private readonly registry: SubjectStateRegistry,
    private readonly leaveRepo: StudentLeaveRequestRepository,
    private readonly attendanceService: FacultyAttendanceService,
    private readonly staffLeaveRepo: StaffLeaveRequestRepository,
    private readonly staffAttendanceRepo: StaffAttendanceRepository,
    private readonly appraisalRepo: StaffAppraisalRepository,
  ) {}

  onModuleInit(): void {
    this.registry.register('student_leave_request', {
      onApproved: async (id, executor, decidedBy) => {
        await this.leaveRepo.setDecision(id, 'APPROVED', decidedBy, executor);
        const request = await this.leaveRepo.findById(id, executor);
        if (!request) return;
        const section = await this.leaveRepo.findCurrentSectionForStudent(request.studentId, executor);
        // A student with no current-year enrolment (rare -- e.g. mid-transfer)
        // has nothing to mark attendance against; the leave itself is still
        // correctly approved either way.
        if (!section) return;
        for (const date of eachDate(request.fromDate, request.toDate)) {
          await this.attendanceService.ensureSessionAndMarkStatus(
            { sectionId: section.sectionId, date, studentId: request.studentId, status: 'ON_LEAVE', reason: 'Approved leave request', actorPersonId: decidedBy },
            executor,
          );
        }
      },
      onRejected: async (id, executor, decidedBy) => {
        await this.leaveRepo.setDecision(id, 'REJECTED', decidedBy, executor);
      },
    });

    this.registry.register('staff_leave_request', {
      onApproved: async (id, executor, decidedBy) => {
        await this.staffLeaveRepo.setDecision(id, 'APPROVED', decidedBy, executor);
        const request = await this.staffLeaveRepo.findById(id, executor);
        if (!request) return;
        const eventType = request.leaveType === 'ON_DUTY' ? 'ON_DUTY' : 'ABSENT';
        const events = [...eachDate(request.fromDate, request.toDate)].map((date) => ({
          staffId: request.staffId,
          eventType: eventType as 'ON_DUTY' | 'ABSENT',
          // Fixed 9am for the whole date -- same convention the existing
          // Admin bulk-manual-mark path already uses (see
          // StaffAttendanceRepository's own findDailyRoster doc comment).
          occurredAt: `${date}T09:00:00.000Z`,
          reason: `Auto-marked from approved ${request.leaveType === 'ON_DUTY' ? 'on-duty' : 'leave'} request`,
          recordedBy: decidedBy,
        }));
        await this.staffAttendanceRepo.markMany(events, executor);
      },
      onRejected: async (id, executor, decidedBy) => {
        await this.staffLeaveRepo.setDecision(id, 'REJECTED', decidedBy, executor);
      },
    });

    // Two-step chain (Principal -> Finance, both already seeded) -- the
    // generic engine only calls onApproved once the FINAL step (Finance)
    // decides (see ApprovalsService.approve's own isFinal check), so a
    // plain simpleStateColumnHandler is enough: no bespoke code is needed to
    // enforce "not visible until Finance approves" -- that gating already
    // happens upstream of this handler ever being called.
    this.registry.register('staff_hr_request', simpleStateColumnHandler('staff_hr_request'));

    // staff_appraisal's state enum is SUBMITTED/REVIEWED, not
    // APPROVED/REJECTED -- there's no real "reject a self-assessment"
    // concept, and the generic engine's onApproved/onRejected carry no score
    // or remark text (Principal's own scoring UI is out of scope). Either
    // decision just closes the review cycle the same way.
    this.registry.register('staff_appraisal', {
      onApproved: async (id, executor, decidedBy) => {
        await this.appraisalRepo.markReviewed(id, decidedBy, executor);
      },
      onRejected: async (id, executor, decidedBy) => {
        await this.appraisalRepo.markReviewed(id, decidedBy, executor);
      },
    });
  }
}
