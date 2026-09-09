// Class Teacher -- CLASS ADVISOR only. Two halves: (1) a real-time class-
// advisor-duty dashboard (today's attendance-register status, pending leave
// approvals -- the two real, already-built duties this schema actually backs;
// deliberately NOT inventing "discipline notes"/"fee follow-up" cards with no
// real table behind them just to match the design's own mock data), and
// (2) full CRUD over student_duty_assignment -- the "class leader / class
// officer" feature, search-select-assign, shown at the bottom.

import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { AttendanceRecordRepository } from '../attendance/repositories/attendance-record.repository';
import { AttendanceSessionRepository } from '../attendance/repositories/attendance-session.repository';
import { CreateStudentDutyDto } from './dto/create-student-duty.dto';
import { UpdateStudentDutyDto } from './dto/update-student-duty.dto';
import { FacultyScopeRepository } from './repositories/faculty-scope.repository';
import { StudentDutyRepository } from './repositories/student-duty.repository';
import { StudentLeaveRequestRepository } from './repositories/student-leave-request.repository';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

@Injectable()
export class FacultyClassTeacherService {
  constructor(
    private readonly scopeRepo: FacultyScopeRepository,
    private readonly sessionRepo: AttendanceSessionRepository,
    private readonly recordRepo: AttendanceRecordRepository,
    private readonly leaveRepo: StudentLeaveRequestRepository,
    private readonly dutyRepo: StudentDutyRepository,
    private readonly audit: AuditService,
  ) {}

  private async assertAdvisor(personId: string, sectionId: string) {
    const isAdvisor = await this.scopeRepo.isAdvisorForSection(personId, sectionId);
    if (!isAdvisor) throw new ForbiddenException('You are not the class advisor for this section.');
  }

  async getDashboard(personId: string, sectionId: string) {
    await this.assertAdvisor(personId, sectionId);

    const [studentIds, session, leaveRequests, officers] = await Promise.all([
      this.sessionRepo.findActiveEnrolledStudentIds(sectionId),
      this.sessionRepo.findBySectionAndDate(sectionId, todayIso()),
      this.leaveRepo.findBySections([sectionId]),
      this.dutyRepo.findActiveForSection(sectionId),
    ]);

    let presentToday = 0;
    let onLeaveToday = 0;
    let attendanceSubmitted = false;
    if (session) {
      attendanceSubmitted = true;
      const records = await this.recordRepo.findBySessionId(session.id, sectionId);
      presentToday = records.filter((r) => ['PRESENT', 'LATE', 'HALF_DAY'].includes(r.status)).length;
      onLeaveToday = records.filter((r) => r.status === 'ON_LEAVE').length;
    }

    const pendingLeave = leaveRequests.filter((r) => r.state === 'PENDING');

    return {
      stats: { strength: studentIds.length, presentToday, onLeaveToday },
      classDuties: [
        {
          key: 'ATTENDANCE_REGISTER',
          title: 'Attendance register',
          meta: attendanceSubmitted ? `Submitted for ${todayIso()}` : 'Not yet submitted today',
          status: attendanceSubmitted ? 'Done' : 'Pending',
        },
        {
          key: 'LEAVE_APPROVALS',
          title: 'Leave approvals',
          meta: `${pendingLeave.length} request${pendingLeave.length === 1 ? '' : 's'} pending`,
          status: String(pendingLeave.length),
          pending: pendingLeave.map((r) => ({
            id: r.id,
            studentName: r.studentName,
            fromDate: r.fromDate,
            toDate: r.toDate,
            reason: r.reason,
          })),
        },
      ],
      officers,
    };
  }

  async searchStudents(personId: string, sectionId: string, query: string) {
    await this.assertAdvisor(personId, sectionId);
    if (!query || query.trim().length < 1) return [];
    return this.dutyRepo.searchStudents(sectionId, query.trim());
  }

  async listDuties(personId: string, sectionId: string) {
    await this.assertAdvisor(personId, sectionId);
    return this.dutyRepo.findActiveForSection(sectionId);
  }

  async createDuty(personId: string, sectionId: string, dto: CreateStudentDutyDto) {
    await this.assertAdvisor(personId, sectionId);
    const id = await this.dutyRepo.create({
      studentId: dto.studentId,
      sectionId,
      title: dto.title,
      duties: dto.duties ?? null,
      assignedBy: personId,
    });
    const created = await this.dutyRepo.findById(id);
    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'FACULTY',
      action: 'STUDENT_DUTY_ASSIGNED',
      objectType: 'student_duty_assignment',
      objectId: id,
      outcome: 'SUCCESS',
      afterData: dto,
    });
    return created;
  }

  private async assertOwnsDuty(personId: string, dutyId: string) {
    const duty = await this.dutyRepo.findById(dutyId);
    if (!duty) throw new NotFoundException('Duty assignment not found');
    await this.assertAdvisor(personId, duty.sectionId);
    return duty;
  }

  async updateDuty(personId: string, dutyId: string, dto: UpdateStudentDutyDto) {
    const existing = await this.assertOwnsDuty(personId, dutyId);
    await this.dutyRepo.update(dutyId, dto);
    const updated = await this.dutyRepo.findById(dutyId);
    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'FACULTY',
      action: 'STUDENT_DUTY_UPDATED',
      objectType: 'student_duty_assignment',
      objectId: dutyId,
      outcome: 'SUCCESS',
      beforeData: existing,
      afterData: updated,
    });
    return updated;
  }

  async removeDuty(personId: string, dutyId: string) {
    const existing = await this.assertOwnsDuty(personId, dutyId);
    await this.dutyRepo.delete(dutyId);
    await this.audit.record({
      actorPersonId: personId,
      actorRoleCode: 'FACULTY',
      action: 'STUDENT_DUTY_REMOVED',
      objectType: 'student_duty_assignment',
      objectId: dutyId,
      outcome: 'SUCCESS',
      beforeData: existing,
    });
  }
}
