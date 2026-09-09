// Study Attendance, Parent Call Request, and Hostel Complaints. Was held out of
// AppModule until its backing tables/columns existed (see query.md's 2026-09-07
// entry) -- confirmed live via information_schema on 2026-09-07 and wired in below.
//
// Note: the Gate Pass / Emergency Exit approval_policy seed from the same query.md
// entry has NOT been run yet -- unrelated to this module (those two features live in
// HostelWardenModule, already registered), but still pending.

import { Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module';
import { ParentModule } from '../parent/parent.module';
import { CallRequestsController } from './call-requests.controller';
import { CallRequestsService } from './call-requests.service';
import { ComplaintApprovalHandlers } from './complaint-approval-handlers.service';
import { ComplaintsController } from './complaints.controller';
import { ComplaintsService } from './complaints.service';
import { HostelWardenModule } from './hostel-warden.module';
import { ParentCallRequestsController } from './parent-call-requests.controller';
import { ParentCallRequestsService } from './parent-call-requests.service';
import { HostelCallRequestRepository } from './repositories/hostel-call-request.repository';
import { HostelComplaintRepository } from './repositories/hostel-complaint.repository';
import { HostelStudyAttendanceRepository } from './repositories/hostel-study-attendance.repository';
import { HostelStudySessionRepository } from './repositories/hostel-study-session.repository';
import { StudySessionsController } from './study-sessions.controller';
import { StudySessionsService } from './study-sessions.service';

@Module({
  // HostelWardenModule: reuses WardenContextService/StudentHostelRepository (already
  // exported or provided there) rather than a second copy. ParentModule: reuses
  // GuardianLinkRepository for the parent-initiated Call Request creation flow.
  // ApprovalsModule: so ComplaintsService can route a new complaint to PRINCIPAL via
  // the generic engine, and ComplaintApprovalHandlers can register 'complaint' with
  // SubjectStateRegistry (HostelWardenModule already imports ApprovalsModule too, for
  // its own outing_request handler -- importing it again here for this module's own
  // providers is normal Nest module composition, not a duplicate/conflicting registration).
  imports: [HostelWardenModule, ParentModule, ApprovalsModule],
  controllers: [
    StudySessionsController,
    CallRequestsController,
    ParentCallRequestsController,
    ComplaintsController,
  ],
  providers: [
    HostelStudySessionRepository,
    HostelStudyAttendanceRepository,
    StudySessionsService,
    HostelCallRequestRepository,
    CallRequestsService,
    ParentCallRequestsService,
    HostelComplaintRepository,
    ComplaintsService,
    ComplaintApprovalHandlers,
  ],
})
export class HostelWardenPendingModule {}
