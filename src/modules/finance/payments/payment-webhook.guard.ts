// Guards POST /finance/payment-events — the one endpoint in this whole system exempt
// from Bearer-token auth, authenticated instead by "prove you are the payment
// provider": an HMAC-SHA256 signature computed over the RAW, unparsed request body.
//
// Non-negotiable, same posture as AuthGuard: any failure here — missing header, bad
// signature, no configured secret, an unexpected exception — denies the request.
// Constant-time comparison (timingSafeEqual) so a wrong signature can't be brute-forced
// byte-by-byte via response-time differences.

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
export class PaymentWebhookGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    try {
      const request = context
        .switchToHttp()
        .getRequest<Request & { rawBody?: Buffer }>();
      const signature = request.headers['x-webhook-signature'];
      const secret = this.configService.get<string>(
        'finance.paymentWebhookSecret',
      );

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
