// POST /finance/payment-events — provider-facing, no Bearer auth. @Public() exempts it
// from the global AuthGuard/RolesGuard; PaymentWebhookGuard is the real gate here,
// verifying the gateway's HMAC signature instead. Never add @Roles() to this
// controller — there is no "authorized role" concept for a webhook caller.

import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../../../common/auth/public.decorator';
import { PaymentWebhookDto } from './dto/payment-webhook.dto';
import { PaymentWebhookGuard } from './payment-webhook.guard';
import { PaymentsService } from './payments.service';

@Controller('finance')
export class PaymentWebhookController {
  constructor(private readonly service: PaymentsService) {}

  @Public()
  @UseGuards(PaymentWebhookGuard)
  @Post('payment-events')
  @HttpCode(HttpStatus.OK)
  async handleEvent(@Body() dto: PaymentWebhookDto) {
    return this.service.handleWebhookEvent(dto);
  }
}
