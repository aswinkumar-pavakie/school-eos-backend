// POST /auth/login, /auth/refresh, /auth/logout, GET /me.

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { Public } from '../../common/auth/public.decorator';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh.dto';
import { deviceContextFrom } from './device-context.util';
import { IdentityService } from './identity.service';

@Controller('auth')
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const result = await this.identityService.login(
      dto,
      deviceContextFrom(req),
    );
    return { data: result };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    const result = await this.identityService.refresh(
      dto,
      deviceContextFrom(req),
    );
    return { data: result };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Body() dto: RefreshTokenDto) {
    await this.identityService.logout(dto);
    return { data: { loggedOut: true } };
  }

  @Get('me')
  async me(@CurrentActor() actor: AuthenticatedUser) {
    const result = await this.identityService.me(actor.personId);
    return { data: result };
  }
}
