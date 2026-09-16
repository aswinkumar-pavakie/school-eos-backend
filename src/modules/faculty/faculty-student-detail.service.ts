import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AttendanceRecordsService } from '../attendance/attendance-records.service';
import { StudentFeesService } from '../finance/student-fees.service';
import { GuardianLinksService } from '../people/guardian-links.service';
import { StudentsService } from '../people/students.service';
import { FacultyScopeRepository } from './repositories/faculty-scope.repository';

// A class advisor's real, full-profile read on one student in their own
// section -- reuses the exact same, already-built, already-live services the
// ADMIN/PRINCIPAL/VICE_PRINCIPAL-only students.controller.ts already calls
// (StudentsService.get, GuardianLinksService.listByStudent,
// AttendanceRecordsService.getAttendanceSummaryForStudent,
// StudentFeesService.getSummaryForStudent) -- never a second copy of that
// logic, never a schema change. That controller has no section-scoping at
// all (correct for org-wide ADMIN/PRINCIPAL oversight, wrong for FACULTY),
// so rather than widening its @Roles() unscoped, this is a new, narrower
// entry point that checks isAdvisorForSection against the student's own
// current section before returning anything.
@Injectable()
export class FacultyStudentDetailService {
  constructor(
    private readonly studentsService: StudentsService,
    private readonly guardianLinksService: GuardianLinksService,
    private readonly attendanceRecordsService: AttendanceRecordsService,
    private readonly studentFeesService: StudentFeesService,
    private readonly scopeRepo: FacultyScopeRepository,
  ) {}

  async getStudentDetail(personId: string, studentId: string) {
    const student = await this.studentsService.get(studentId);
    if (!student.sectionId) {
      throw new NotFoundException('This student has no active class enrolment.');
    }
    const isAdvisor = await this.scopeRepo.isAdvisorForSection(
      personId,
      student.sectionId,
    );
    if (!isAdvisor) {
      throw new ForbiddenException(
        'You are only able to view students in a class you are the class advisor of.',
      );
    }

    const [guardians, attendance, fees] = await Promise.all([
      this.guardianLinksService.listByStudent(studentId),
      this.attendanceRecordsService.getAttendanceSummaryForStudent(studentId),
      this.studentFeesService.getSummaryForStudent(studentId),
    ]);

    return { student, guardians, attendance, fees };
  }
}
