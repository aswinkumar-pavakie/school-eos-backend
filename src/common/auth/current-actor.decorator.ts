// @CurrentActor() param decorator — reads the AuthenticatedUser AuthGuard attached to
// the request. Only valid on routes behind AuthGuard (i.e. not @Public()).

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AuthenticatedUser } from './authenticated-user.interface';

export const CurrentActor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>();
    return request.user;
  },
);
