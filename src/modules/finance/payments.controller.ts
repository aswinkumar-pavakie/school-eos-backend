import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator';
import { PaymentQueryDto } from './dto/payment-query.dto';
import { PaymentsService } from './payments.service';

// Admin's read-only payment/receipt visibility -- Admin -> Finance section 4.
// Deliberately no collect/confirm/refund/reconcile actions here; those are
// Finance operational responsibilities, not Admin's.
// PRINCIPAL added (Phase 16) -- same read-only oversight scope; 100% GET.
// VICE_PRINCIPAL added (Vice Principal mobile Finance module) for the exact
// same read-only oversight scope as Principal, nothing more.
@Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  async list(@Query() query: PaymentQueryDto) {
    return await this.paymentsService.list(query);
  }
}
