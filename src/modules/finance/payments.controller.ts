import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator';
import { PaymentQueryDto } from './dto/payment-query.dto';
import { PaymentsService } from './payments.service';

// Admin's read-only payment/receipt visibility -- Admin -> Finance section 4.
// Deliberately no collect/confirm/refund/reconcile actions here; those are
// Finance operational responsibilities, not Admin's.
@Roles('ADMIN')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  async list(@Query() query: PaymentQueryDto) {
    return await this.paymentsService.list(query);
  }
}
