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
  // ApprovalStepRepository: so a feature that already owns its own authorization
  // check (e.g. Faculty's own HR/Payslip/Appraisal requests, scoped to the
  // caller's own staffId) can read the real decidedByName/role trail directly,
  // without going through getById's own separate requester-or-approver check.
  exports: [ApprovalsService, SubjectStateRegistry, ApprovalStepRepository],
})
export class ApprovalsModule {}
