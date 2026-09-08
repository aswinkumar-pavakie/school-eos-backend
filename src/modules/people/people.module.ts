// Staff & Student Records — Phase 2 of Admin's backend. Attaches Staff/Student
// subtype records to a `person` that already exists (created via `admin/`'s
// POST /persons, which also handles login credential + initial role assignment).
// Person → Staff/Student → Guardian, per workflow.md's dependency chain.

import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { AdminFinanceModule } from '../finance/admin-finance.module';
import { IdentityModule } from '../identity/identity.module';
import { StaffAttendanceModule } from '../staff-attendance/staff-attendance.module';
import { TimetableModule } from '../timetable/timetable.module';
import { TransportModule } from '../transport/transport.module';
import { EnrolmentsController } from './enrolments.controller';
import { EnrolmentsService } from './enrolments.service';
import { GuardianLinksController } from './guardian-links.controller';
import { GuardianLinksService } from './guardian-links.service';
import { ParentsController } from './parents.controller';
import { ParentsService } from './parents.service';
import { GuardianLinkRepository } from './repositories/guardian-link.repository';
import { StaffRepository } from './repositories/staff.repository';
import { StudentEnrolmentRepository } from './repositories/student-enrolment.repository';
import { StudentRepository } from './repositories/student.repository';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';

@Module({
  imports: [IdentityModule, TransportModule, TimetableModule, AdminFinanceModule, AttendanceModule, StaffAttendanceModule],
  controllers: [
    StaffController,
    StudentsController,
    EnrolmentsController,
    GuardianLinksController,
    ParentsController,
  ],
  providers: [
    StaffService,
    StudentsService,
    EnrolmentsService,
    GuardianLinksService,
    ParentsService,
    StaffRepository,
    StudentRepository,
    StudentEnrolmentRepository,
    GuardianLinkRepository,
  ],
  // StudentsService also backs the "Student administrative record correction"
  // effect in RequestsApprovalsModule (same cross-module pattern as the rest
  // of this codebase). StaffRepository/StaffService additionally back the Events
  // module's "monitoring teacher" picker (a real staff search, not free text).
  exports: [StudentRepository, StudentsService, StaffRepository, StaffService],
})
export class PeopleModule {}
