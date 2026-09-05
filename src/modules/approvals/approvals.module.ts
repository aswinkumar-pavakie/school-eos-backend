import { Module } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { OutboxService } from '../../common/outbox/outbox.service';
import { ApprovalsController } from './approvals.controller';
import { ApprovalsService } from './approvals.service';
import { ApprovalPolicyRepository } from './repositories/approval-policy.repository';
import { ApprovalRequestRepository } from './repositories/approval-request.repository';
import { ApprovalStepRepository } from './repositories/approval-step.repository';
import { ApproverAssignmentRepository } from './repositories/approver-assignment.repository';
import { SubjectStateRegistry } from './subject-state.registry';

@Module({
  controllers: [ApprovalsController],
  providers: [
    ApprovalsService,
    ApprovalRequestRepository,
    ApprovalStepRepository,
    ApprovalPolicyRepository,
    ApproverAssignmentRepository,
    SubjectStateRegistry,
    OutboxService,
    AuditService,
  ],
  // ApprovalsService: so other feature modules can call createRequest() in-process,
  // inside their own transaction. SubjectStateRegistry: so the owning feature module
  // can register its own subject_object_type -> state-transition handler.
  exports: [ApprovalsService, SubjectStateRegistry],
})
export class ApprovalsModule {}
