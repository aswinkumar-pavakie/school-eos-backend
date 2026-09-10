// Hostel Warden -- mobile-only role, hostel-scoped daily operations layered on top of
// Admin's hostel structure module (src/modules/hostel), which stays the only writer of
// hostel/block/room/bed/allocation data. This module holds the 6 features backed by
// tables that already exist live in the DB: Night Attendance, Gate Pass, Emergency
// Exit, Visitor Log, Class Absence Alerts, and read-only Room & Bed View.
//
// Study Attendance, Parent Call Requests, and Hostel Complaints need new schema (see
// query.md) and are implemented separately in HostelWardenPendingModule, which is
// deliberately NOT imported into AppModule yet -- same discipline as the removed
// Permission module (see query.md's history).

import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { OutboxService } from '../../common/outbox/outbox.service';
import { HostelModule } from '../hostel/hostel.module';
import { PeopleModule } from '../people/people.module';
import { ClassAbsenceAlertsController } from './class-absence-alerts.controller';
import { ClassAbsenceAlertsService } from './class-absence-alerts.service';
import { EmergencyExitRequestsController } from './emergency-exit-requests.controller';
import { GatePassRequestsController } from './gate-pass-requests.controller';
import { HostelWardenApprovalHandlers } from './hostel-warden-approval-handlers.service';
import { NightAttendanceController } from './night-attendance.controller';
import { NightAttendanceService } from './night-attendance.service';
import { OutingRequestsSharedService } from './outing-requests-shared.service';
import { ClassAbsenceAlertRepository } from './repositories/class-absence-alert.repository';
import { GatePassRepository } from './repositories/gate-pass.repository';
import { HostelAttendanceRepository } from './repositories/hostel-attendance.repository';
import { HostelVisitorRepository } from './repositories/hostel-visitor.repository';
import { OutingRequestRepository } from './repositories/outing-request.repository';
import { StudentGuardianRepository } from './repositories/student-guardian.repository';
import { StudentHostelRepository } from './repositories/student-hostel.repository';
import { WardenAssignmentRepository } from './repositories/warden-assignment.repository';
import { RoomBedViewController } from './room-bed-view.controller';
import { RoomBedViewService } from './room-bed-view.service';
import { VisitorLogController } from './visitor-log.controller';
import { VisitorLogService } from './visitor-log.service';
import { WardenContextService } from './warden-context.service';

@Module({
  imports: [PeopleModule, HostelModule, AttendanceModule, ApprovalsModule],
  controllers: [
    NightAttendanceController,
    VisitorLogController,
    GatePassRequestsController,
    EmergencyExitRequestsController,
    ClassAbsenceAlertsController,
    RoomBedViewController,
  ],
  providers: [
    WardenContextService,
    WardenAssignmentRepository,
    StudentHostelRepository,
    HostelAttendanceRepository,
    NightAttendanceService,
    HostelVisitorRepository,
    VisitorLogService,
    OutingRequestRepository,
    GatePassRepository,
    OutingRequestsSharedService,
    HostelWardenApprovalHandlers,
    ClassAbsenceAlertRepository,
    ClassAbsenceAlertsService,
    RoomBedViewService,
    StudentGuardianRepository,
    OutboxService,
  ],
  // OutingRequestRepository: so ParentModule can create outing_request rows
  // (Gate Pass / Emergency Exit) in-process without a second copy of this query --
  // same cross-module reuse pattern as the rest of this codebase.
  // StudentHostelRepository: same reuse, for resolving which hostel a brand-new
  // parent-initiated request (Gate Pass / Emergency Exit / Call Request) belongs to.
  // WardenContextService: so HostelWardenPendingModule's Study Attendance / Call
  // Request / Complaints services can resolve "who is this Warden" the same way,
  // without a second copy of that resolution logic.
  // WardenAssignmentRepository / OutboxService: so HostelWardenPendingModule's
  // Call Request feature (not on the generic approvals engine, so it must raise
  // its own real notifications) can resolve "who wardens this hostel" and write
  // to the same notification outbox every other feature already writes to.
  exports: [
    OutingRequestRepository,
    StudentHostelRepository,
    WardenContextService,
    WardenAssignmentRepository,
    OutboxService,
  ],
})
export class HostelWardenModule {}
