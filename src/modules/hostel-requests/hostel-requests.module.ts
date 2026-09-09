import { Module } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { GuardianLinkRepository } from '../parent/repositories/guardian-link.repository';
import {
  HostelWardenCallRequestsController,
  HostelWardenEmergencyExitController,
  HostelWardenGatePassController,
} from './hostel-warden-requests.controller';
import { HostelWardenRequestsService } from './hostel-warden-requests.service';
import { ParentCallRequestsController } from './parent-call-requests.controller';
import { ParentCallRequestsService } from './parent-call-requests.service';
import {
  ParentEmergencyExitController,
  ParentGatePassController,
} from './parent-hostel-requests.controller';
import { ParentHostelRequestsService } from './parent-hostel-requests.service';
import { CallRequestRepository } from './repositories/call-request.repository';
import { HostelScopeRepository } from './repositories/hostel-scope.repository';
import { OutingRequestRepository } from './repositories/outing-request.repository';

// GuardianLinkRepository: ParentModule doesn't export it, so (being a
// stateless, PostgresService-only repository) it's provided a second time
// here directly, same pattern used throughout this codebase for repositories
// their home module doesn't export.
@Module({
  controllers: [
    HostelWardenGatePassController,
    HostelWardenEmergencyExitController,
    HostelWardenCallRequestsController,
    ParentGatePassController,
    ParentEmergencyExitController,
    ParentCallRequestsController,
  ],
  providers: [
    AuditService,
    GuardianLinkRepository,
    HostelScopeRepository,
    OutingRequestRepository,
    CallRequestRepository,
    HostelWardenRequestsService,
    ParentHostelRequestsService,
    ParentCallRequestsService,
  ],
})
export class HostelRequestsModule {}
