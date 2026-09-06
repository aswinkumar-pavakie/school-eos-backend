// POST /parent/razorpay/webhook — provider-facing, no Bearer auth, same posture as
// Finance's own PaymentWebhookController: @Public() exempts it from the global
// AuthGuard/RolesGuard, RazorpayWebhookGuard is the real gate (Razorpay's own HMAC
// signature). Never add @Roles() here.

import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { Public } from '../../../common/auth/public.decorator';
import { ParentFeesService } from '../parent-fees.service';
import { RazorpayWebhookGuard } from './razorpay-webhook.guard';

@Controller('parent/razorpay')
export class RazorpayWebhookController {
  constructor(private readonly service: ParentFeesService) {}

  @Public()
  @UseGuards(RazorpayWebhookGuard)
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handle(@Body() body: any) {
    return this.service.handleRazorpayWebhook(body);
  }
}
