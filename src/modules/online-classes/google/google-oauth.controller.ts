// GET /online-classes/google/connect (Faculty, authenticated) and
// GET /online-classes/google/callback (Google's redirect target — @Public, since it's
// a plain browser navigation with no Authorization header; identity is re-verified via
// the signed `state` param instead, see oauth-state.util.ts).

import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../../common/auth/current-actor.decorator';
import { Public } from '../../../common/auth/public.decorator';
import { Roles } from '../../../common/auth/roles.decorator';
import { GoogleOAuthService } from './google-oauth.service';

@Controller('online-classes/google')
export class GoogleOAuthController {
  constructor(private readonly googleOAuthService: GoogleOAuthService) {}

  @Roles('FACULTY')
  @Get('connect')
  async connect(@CurrentActor() actor: AuthenticatedUser) {
    const authUrl = await this.googleOAuthService.buildConsentUrl(actor.personId);
    return { data: { authUrl } };
  }

  @Public()
  @Get('callback')
  async callback(
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') error?: string,
  ) {
    if (!state) {
      throw new BadRequestException('Missing state parameter');
    }
    const result = await this.googleOAuthService.handleCallback(code, state, error);
    return { data: result };
  }
}
