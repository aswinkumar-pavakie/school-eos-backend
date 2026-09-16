// Service-to-service auth for the new school-eos-messaging microservice — the
// first such pattern in this codebase (confirmed by grep: no existing
// x-api-key/mTLS/second-JWT-audience convention anywhere else). Deliberately
// simple: a shared-secret header, compared in constant time, on a small,
// explicitly internal-only controller. No mTLS/service-mesh — nothing here
// justifies that complexity yet (see messaging-integration/README.md).
//
// Non-negotiable, same posture as AuthGuard: any failure — missing header,
// mismatch, misconfigured (empty) server-side key — DENIES. An empty
// MESSAGING_INTERNAL_KEY must never be treated as "no key required"; it means
// this integration hasn't been configured yet, so every call is refused.

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'crypto';
import type { Request } from 'express';

const HEADER_NAME = 'x-internal-service-key';

/** Constant-time comparison of two arbitrary-length strings. Hashing both
 * sides to a fixed-length digest first avoids timingSafeEqual's own
 * requirement that both buffers be the same length (which would otherwise
 * itself leak the expected key's length via a thrown-vs-not-thrown timing
 * difference) — a standard, well-known idiom for this exact problem, not
 * invented cryptography. */
function safeEqual(a: string, b: string): boolean {
  const digestA = createHash('sha256').update(a).digest();
  const digestB = createHash('sha256').update(b).digest();
  return timingSafeEqual(digestA, digestB);
}

@Injectable()
export class InternalServiceGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    try {
      const expectedKey = this.configService.get<string>(
        'messagingIntegration.internalKey',
      );
      if (!expectedKey) {
        throw new UnauthorizedException();
      }

      const request = context.switchToHttp().getRequest<Request>();
      const providedKey = request.headers[HEADER_NAME];
      if (typeof providedKey !== 'string' || !providedKey) {
        throw new UnauthorizedException();
      }

      if (!safeEqual(providedKey, expectedKey)) {
        throw new UnauthorizedException();
      }

      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
