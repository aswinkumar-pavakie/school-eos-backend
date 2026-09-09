import { Module } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { AnnouncementsModule } from '../announcements/announcements.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { FacultyAcademicCoordinatorController } from './faculty-academic-coordinator.controller';
import { FacultyAcademicCoordinatorService } from './faculty-academic-coordinator.service';
import { FacultyAnnouncementsController } from './faculty-announcements.controller';
import { FacultyAppraisalController } from './faculty-appraisal.controller';
import { FacultyAppraisalService } from './faculty-appraisal.service';
import { FacultyApprovalHandlers } from './faculty-approval-handlers.service';
import { FacultyAttendanceController } from './faculty-attendance.controller';
import { FacultyAttendanceService } from './faculty-attendance.service';
import { FacultyBusController } from './faculty-bus.controller';
import { FacultyCalendarController } from './faculty-calendar.controller';
import { FacultyCalendarService } from './faculty-calendar.service';
import { FacultyClassResultsController } from './faculty-class-results.controller';
import { FacultyClassResultsService } from './faculty-class-results.service';
import { FacultyClassTeacherController } from './faculty-class-teacher.controller';
import { FacultyClassTeacherService } from './faculty-class-teacher.service';
import { FacultyHomeworkController } from './faculty-homework.controller';
import { FacultyHomeworkService } from './faculty-homework.service';
import { FacultyHrRequestsController } from './faculty-hr-requests.controller';
import { FacultyHrRequestsService } from './faculty-hr-requests.service';
import { FacultyLibraryController } from './faculty-library.controller';
import { FacultyLmsController } from './faculty-lms.controller';
import { FacultyLmsService } from './faculty-lms.service';
import { FacultyMarksController } from './faculty-marks.controller';
import { FacultyMarksService } from './faculty-marks.service';
import { FacultyMyAttendanceController } from './faculty-my-attendance.controller';
import { FacultyMyAttendanceService } from './faculty-my-attendance.service';
import {
  FacultyParentMeetingsController,
  ParentMeetingBookingController,
  ParentMeetingSlotsController,
} from './faculty-parent-meetings.controller';
import { FacultyParentMeetingsService } from './faculty-parent-meetings.service';
import { FacultyPayslipController } from './faculty-payslip.controller';
import { FacultyPayslipService } from './faculty-payslip.service';
import { FacultyScopeController } from './faculty-scope.controller';
import { FacultyStaffLeaveController } from './faculty-staff-leave.controller';
import { FacultyStaffLeaveService } from './faculty-staff-leave.service';
import {
  FacultyStudentLeaveController,
  ParentStudentLeaveController,
} from './faculty-student-leave.controller';
import { FacultyStudentLeaveService } from './faculty-student-leave.service';
import { FacultySubjectRecordsController } from './faculty-subject-records.controller';
import { FacultySubjectRecordsService } from './faculty-subject-records.service';
import { FacultyTimetableController } from './faculty-timetable.controller';
import { FacultyTimetableService } from './faculty-timetable.service';
import { FacultyScopeRepository } from './repositories/faculty-scope.repository';
import { AcademicCoordinatorRepository } from './repositories/academic-coordinator.repository';
import { AcademicCoordinatorExamRepository } from './repositories/academic-coordinator-exam.repository';
import { AcademicCoordinatorTimetableRepository } from './repositories/academic-coordinator-timetable.repository';
import { CalendarRepository } from './repositories/calendar.repository';
import { HomeworkRepository } from './repositories/homework.repository';
import { LmsFolderRepository } from './repositories/lms-folder.repository';
import { LmsLessonPlanRepository } from './repositories/lms-lesson-plan.repository';
import { LmsTaskRepository } from './repositories/lms-task.repository';
import { MarksRepository } from './repositories/marks.repository';
import { PayslipRepository } from './repositories/payslip.repository';
import { StaffAppraisalRepository } from './repositories/staff-appraisal.repository';
import { StaffBusRepository } from './repositories/staff-bus.repository';
import { StaffHrRequestRepository } from './repositories/staff-hr-request.repository';
import { StaffLeaveRequestRepository } from './repositories/staff-leave-request.repository';
import { StaffMeetingRepository } from './repositories/staff-meeting.repository';
import { StudentDutyRepository } from './repositories/student-duty.repository';
import { StudentLeaveRequestRepository } from './repositories/student-leave-request.repository';
import { TimetableRepository } from './repositories/timetable.repository';
import { StaffAttendanceModule } from '../staff-attendance/staff-attendance.module';
import { LibraryModule } from '../library/library.module';

@Module({
  // ApprovalsModule: real approval routing for student_leave_request (and
  // later staff_leave_request/staff_hr_request/staff_appraisal) via the same
  // generic engine every other approval-routed subject in this codebase uses.
  // AttendanceModule: reuses AttendanceRecordsService/AttendanceSessionRepository/
  // AttendanceRecordRepository/AttendanceCorrectionRepository as-is (see
  // attendance.module.ts's own widened exports) rather than a second copy of
  // the locked-session correction logic.
  // StaffAttendanceModule: reuses StaffAttendanceRepository (its own widened
  // exports) for Faculty's own read-only "My Attendance" view over the same
  // real staff_attendance_event table the Admin bulk-marking feature uses.
  imports: [
    ApprovalsModule,
    AttendanceModule,
    AnnouncementsModule,
    StaffAttendanceModule,
    LibraryModule,
  ],
  controllers: [
    FacultyScopeController,
    FacultyAttendanceController,
    FacultyStudentLeaveController,
    ParentStudentLeaveController,
    FacultySubjectRecordsController,
    FacultyMarksController,
    FacultyAnnouncementsController,
    FacultyClassResultsController,
    FacultyHomeworkController,
    FacultyClassTeacherController,
    FacultyMyAttendanceController,
    FacultyStaffLeaveController,
    FacultyHrRequestsController,
    FacultyPayslipController,
    FacultyAppraisalController,
    FacultyLibraryController,
    FacultyTimetableController,
    FacultyCalendarController,
    FacultyBusController,
    FacultyLmsController,
    FacultyParentMeetingsController,
    ParentMeetingBookingController,
    ParentMeetingSlotsController,
    FacultyAcademicCoordinatorController,
  ],
  providers: [
    AuditService,
    FacultyScopeRepository,
    FacultyAttendanceService,
    StudentLeaveRequestRepository,
    FacultyStudentLeaveService,
    FacultyApprovalHandlers,
    MarksRepository,
    FacultySubjectRecordsService,
    FacultyMarksService,
    FacultyClassResultsService,
    HomeworkRepository,
    FacultyHomeworkService,
    StudentDutyRepository,
    FacultyClassTeacherService,
    FacultyMyAttendanceService,
    StaffLeaveRequestRepository,
    FacultyStaffLeaveService,
    StaffHrRequestRepository,
    FacultyHrRequestsService,
    PayslipRepository,
    FacultyPayslipService,
    StaffAppraisalRepository,
    FacultyAppraisalService,
    TimetableRepository,
    FacultyTimetableService,
    CalendarRepository,
    FacultyCalendarService,
    StaffBusRepository,
    LmsFolderRepository,
    LmsTaskRepository,
    LmsLessonPlanRepository,
    FacultyLmsService,
    StaffMeetingRepository,
    FacultyParentMeetingsService,
    AcademicCoordinatorRepository,
    AcademicCoordinatorTimetableRepository,
    AcademicCoordinatorExamRepository,
    FacultyAcademicCoordinatorService,
  ],
})
export class FacultyModule {}
