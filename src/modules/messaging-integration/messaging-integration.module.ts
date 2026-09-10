import { Module } from '@nestjs/common';
import { ClassAdvisorRepository } from '../messaging/repositories/class-advisor.repository';
import { GuardianLinkRepository } from '../messaging/repositories/guardian-link.repository';
import { StaffRepository } from '../messaging/repositories/staff.repository';
import { SubjectOfferingRepository } from '../messaging/repositories/subject-offering.repository';
import { HostelAllocationRepository } from '../hostel/repositories/hostel-allocation.repository';
import { StudentGuardianRepository } from '../hostel-warden/repositories/student-guardian.repository';
import { StudentHostelRepository } from '../hostel-warden/repositories/student-hostel.repository';
import { WardenAssignmentRepository } from '../hostel-warden/repositories/warden-assignment.repository';
import { PersonDeviceTokenRepository } from '../notifications/repositories/person-device-token.repository';
import { InternalServiceGuard } from './internal-service.guard';
import { MessagingIntegrationController } from './messaging-integration.controller';
import { MessagingIntegrationService } from './messaging-integration.service';
import { HostelRelationshipRepository } from './repositories/hostel-relationship.repository';
import { MessagingUserRepository } from './repositories/messaging-user.repository';

// Every repository here is re-provided directly rather than exported from its
// home module — the same "narrow per-module repo, provided again where
// reused" convention already established throughout this codebase (see e.g.
// hostel-requests.module.ts's own comment on GuardianLinkRepository). None of
// these home modules (MessagingModule, HostelWardenModule, HostelModule) are
// imported here — only their stateless, PostgresService-only repository
// classes are, so this module has no risk of pulling in unrelated
// controllers/providers from those modules.
@Module({
  controllers: [MessagingIntegrationController],
  providers: [
    MessagingIntegrationService,
    InternalServiceGuard,
    MessagingUserRepository,
    HostelRelationshipRepository,
    ClassAdvisorRepository,
    GuardianLinkRepository,
    StaffRepository,
    SubjectOfferingRepository,
    HostelAllocationRepository,
    StudentGuardianRepository,
    StudentHostelRepository,
    WardenAssignmentRepository,
    PersonDeviceTokenRepository,
  ],
})
export class MessagingIntegrationModule {}
