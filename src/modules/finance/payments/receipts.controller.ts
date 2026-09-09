// Separate from PaymentsController (finance/payments) so ":id" route resolution
// never has to worry about "receipts" being swallowed as a payment id — a receipt is
// its own addressable resource (one per student per payment), not a sub-route of one
// payment, since Student Workspace and the Payments tab both need to print one
// directly by its own id.

import { Controller, Get, Param } from '@nestjs/common';
import { Roles } from '../../../common/auth/roles.decorator';
import { PaymentsService } from './payments.service';

@Controller('finance/receipts')
@Roles('FINANCE', 'ADMIN')
export class ReceiptsController {
  constructor(private readonly service: PaymentsService) {}

  @Get(':id')
  async getById(@Param('id') id: string) {
    const data = await this.service.getReceiptDetail(id);
    return { data };
  }
}
