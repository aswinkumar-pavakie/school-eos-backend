// Study Attendance, Parent Call Request, and Hostel Complaints. Was held out of
// AppModule until its backing tables/columns existed (see query.md's 2026-09-07
// entry) -- confirmed live via information_schema on 2026-09-07 and wired in below.
//
// Note: the Gate Pass / Emergency Exit approval_policy seed from the same query.md
// entry has NOT been run yet -- unrelated to this module (those two features live in
// HostelWardenModule, already registered), but still pending.

import { Module } from '@nestjs/common';
import { ParentModule } from '../parent/parent.module';
import { CallRequestsController } from './call-requests.controller';
import { CallRequestsService } from './call-requests.service';
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
  imports: [HostelWardenModule, ParentModule],
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
  ],
})
export class HostelWardenPendingModule {}
