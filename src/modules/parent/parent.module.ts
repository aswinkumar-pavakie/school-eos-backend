import { Module } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { FinanceModule } from '../finance/finance.module';
import { StudentEventsModule } from '../student-events/student-events.module';
import { ParentFeesController } from './parent-fees.controller';
import { ParentFeesService } from './parent-fees.service';
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
  // cross-module reuse pattern as the rest of this codebase.
  imports: [FinanceModule, StudentEventsModule],
  controllers: [ParentFeesController, RazorpayWebhookController, ParentPermissionsController],
  providers: [
    AuditService,
    GuardianLinkRepository,
    ParentFeeRepository,
    GatewayOrderRepository,
    RazorpayService,
    RazorpayWebhookGuard,
    ParentFeesService,
    ParentPermissionsService,
  ],
})
export class ParentModule {}
