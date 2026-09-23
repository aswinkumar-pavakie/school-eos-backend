// A compromised or malfunctioning counter terminal is the real threat model
// for this endpoint -- it holds a real, long-lived device credential and
// can move real money, so it should never be able to fire charge attempts
// unboundedly fast. No rate-limiting package exists anywhere else in this
// codebase (confirmed: no @nestjs/throttler usage at all), so this is a
// small, self-contained, in-memory sliding-window limiter scoped to just
// this one guard -- not a new app-wide dependency/pattern for a single
// endpoint's need. In-memory is an accepted tradeoff here: this backend
// runs as a single Node process against Supabase (no multi-instance
// deployment in this codebase today), so there's no cross-instance state
// to share.

import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;

@Injectable()
export class CanteenRateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, number[]>();

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    // Keyed by the authenticated person, not the IP -- a shared counter
    // device sits behind one login, and that login is exactly the unit a
    // limit should apply to (an IP could be shared/NAT'd across unrelated
    // devices, under- or over-limiting the wrong thing).
    const key = request.user?.personId ?? request.ip ?? 'unknown';
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter(
      (t) => now - t < WINDOW_MS,
    );

    if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
      throw new HttpException(
        'Too many charge attempts in a short time. Please wait a moment and try again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
}
