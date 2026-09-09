// Guards POST /parent/razorpay/webhook — same non-negotiable posture as Finance's own
// PaymentWebhookGuard (any failure denies the request; constant-time signature
// compare), but Razorpay's own real scheme: header X-Razorpay-Signature, hex
// HMAC-SHA256 over the raw, unparsed body, using the webhook secret set in
// Razorpay Dashboard -> Settings -> Webhooks (a different secret than the API Key
// Secret — never the same value).

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import type { Request } from 'express';

@Injectable()
export class RazorpayWebhookGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    try {
      const request = context
        .switchToHttp()
        .getRequest<Request & { rawBody?: Buffer }>();
      const signature = request.headers['x-razorpay-signature'];
      const secret = this.configService.get<string>('razorpay.webhookSecret');

      if (!secret || typeof signature !== 'string' || !request.rawBody) {
        throw new UnauthorizedException();
      }

      const expected = crypto
        .createHmac('sha256', secret)
        .update(request.rawBody)
        .digest('hex');
      const expectedBuf = Buffer.from(expected, 'hex');
      const providedBuf = Buffer.from(signature, 'hex');

      if (
        expectedBuf.length !== providedBuf.length ||
        !crypto.timingSafeEqual(expectedBuf, providedBuf)
      ) {
        throw new UnauthorizedException();
      }
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
