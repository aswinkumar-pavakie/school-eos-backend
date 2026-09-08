import { Module } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { ApprovalsModule } from '../approvals/approvals.module';
import { FinanceModule } from '../finance/finance.module';
import { HostelWardenModule } from '../hostel-warden/hostel-warden.module';
import { StudentEventsModule } from '../student-events/student-events.module';
import { ParentFeesController } from './parent-fees.controller';
import { ParentFeesService } from './parent-fees.service';
import { ParentHostelRequestsController } from './parent-hostel-requests.controller';
import { ParentHostelRequestsService } from './parent-hostel-requests.service';
import { ParentPermissionsController } from './parent-permissions.controller';
import { ParentPermissionsService } from './parent-permissions.service';
import { GatewayOrderRepository } from './repositories/gateway-order.repository';
import { GuardianLinkRepository } from './repositories/guardian-link.repository';
import { ParentFeeRepository } from './repositories/parent-fee.repository';
import { RazorpayWebhookController } from './razorpay/razorpay-webhook.controller';
import { RazorpayWebhookGuard } from './razorpay/razorpay-webhook.guard';
import { RazorpayService } from './razorpay/razorpay.service';

@Module({
  // FinanceModule: reuses PaymentsService/PaymentRepository/FeeDemandRepository/
  // SchoolProfileRepository as-is (see its own exports) rather than duplicating
  // real transactional payment logic a second time here. StudentEventsModule:
  // reuses its StudentEventRepository/StudentEventParticipantRepository/
  // PermissionLetterDataService for the Permissions feature below, same
  // cross-module reuse pattern as the rest of this codebase. HostelWardenModule:
  // reuses OutingRequestRepository/StudentHostelRepository for the parent-initiated
  // Gate Pass / Emergency Exit requests below. ApprovalsModule: so this module can
  // call ApprovalsService.createRequest in-process, inside its own transaction.
  imports: [
    FinanceModule,
    StudentEventsModule,
    HostelWardenModule,
    ApprovalsModule,
  ],
  controllers: [
    ParentFeesController,
    RazorpayWebhookController,
    ParentPermissionsController,
    ParentHostelRequestsController,
  ],
  providers: [
    AuditService,
    GuardianLinkRepository,
    ParentFeeRepository,
    GatewayOrderRepository,
    RazorpayService,
    RazorpayWebhookGuard,
    ParentFeesService,
    ParentPermissionsService,
    ParentHostelRequestsService,
  ],
  // GuardianLinkRepository: so HostelWardenPendingModule's parent-initiated Call
  // Request feature can reuse the same "real ACTIVE guardian_link" check, once its
  // backing table exists and it's wired into AppModule.
  exports: [GuardianLinkRepository],
})
export class ParentModule {}
