// Admin -> Requests & Approvals -- reuses the real, already-populated generic
// approval engine (approval_policy/approval_request/approval_step, which
// already backs Finance's own multi-step chains and Principal/Class-Advisor
// leave requests) rather than a parallel table. Scoped to exactly the six
// request types Admin is authorized to decide -- see admin-request-types.ts
// and query.md for the schema/policy rows this depends on.

import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { InventoryModule } from '../inventory/inventory.module';
import { MaintenanceModule } from '../maintenance/maintenance.module';
import { PeopleModule } from '../people/people.module';
import { ApprovalRequestsController } from './approval-requests.controller';
import { ApprovalRequestsService } from './approval-requests.service';
import { RequestEffectsService } from './request-effects.service';
import { ApprovalRequestRepository } from './repositories/approval-request.repository';
import { ApprovalStepRepository } from './repositories/approval-step.repository';

@Module({
  // Each import backs one of the six request types' "apply on approve" effect
  // -- AdminModule (activate/deactivate, role grant/revoke), AttendanceModule
  // (correction), PeopleModule (student record update), InventoryModule
  // (issue/transfer), MaintenanceModule (repair-request creation).
  imports: [AdminModule, AttendanceModule, PeopleModule, InventoryModule, MaintenanceModule],
  controllers: [ApprovalRequestsController],
  providers: [ApprovalRequestsService, RequestEffectsService, ApprovalRequestRepository, ApprovalStepRepository],
  // ApprovalRequestRepository is additionally consumed by ReportsModule (Admin
  // Reports & Analytics' Requests & Approvals section reuses this SAME
  // repository's counts, not a parallel query).
  exports: [ApprovalRequestRepository],
})
export class RequestsApprovalsModule {}
