// Global Bearer-token guard, registered once via APP_GUARD in app.module.ts — never
// attached per-controller, so a new controller can't accidentally ship unauthenticated.
//
// Non-negotiable: any failure here — missing header, bad signature, expired token, even
// a bug in this file — must DENY the request. There is no code path that returns true
// except "the token verified". Everything else, including unexpected exceptions, falls
// through to the catch block and throws UnauthorizedException.

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthenticatedUser } from './authenticated-user.interface';
import { IS_PUBLIC_KEY } from './public.decorator';

interface AccessTokenPayload {
  sub: string;
  roles: string[];
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (isPublic) {
        return true;
      }

      const request = context.switchToHttp().getRequest<Request>();
      const token = this.extractBearerToken(request);
      if (!token) {
        throw new UnauthorizedException();
      }

      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token);
      if (!payload?.sub || !Array.isArray(payload.roles)) {
        throw new UnauthorizedException();
      }

      const user: AuthenticatedUser = { personId: payload.sub, roles: payload.roles };
      (request as Request & { user: AuthenticatedUser }).user = user;
      return true;
    } catch {
      // Any failure — expired token, bad signature, malformed header, unexpected
      // error — denies the request. Never let an exception here fall through as a pass.
      throw new UnauthorizedException();
    }
  }

  private extractBearerToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (!header) return undefined;
    const [scheme, token] = header.split(' ');
    return scheme === 'Bearer' && token ? token : undefined;
  }
}
