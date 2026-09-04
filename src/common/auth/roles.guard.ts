// Checks request.user.roles against @Roles(...) metadata. Runs after AuthGuard (both
// are registered as APP_GUARD, in that order) — this guard trusts request.user was set
// correctly by AuthGuard and only answers "is this identity allowed here".
//
// Same non-negotiable as AuthGuard: any failure denies (403), never a silent pass.
// A route with no @Roles() metadata has nothing to check and is allowed through —
// role restriction is opt-in per route, identity verification (AuthGuard) is not.

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthenticatedUser } from './authenticated-user.interface';
import { IS_PUBLIC_KEY } from './public.decorator';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    try {
      const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (isPublic) {
        return true;
      }

      const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (!requiredRoles || requiredRoles.length === 0) {
        return true;
      }

      const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
      const userRoles = request.user?.roles ?? [];
      const allowed = requiredRoles.some((role) => userRoles.includes(role));
      if (!allowed) {
        throw new ForbiddenException();
      }
      return true;
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
      throw new ForbiddenException();
    }
  }
}
