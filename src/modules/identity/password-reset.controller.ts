// POST /auth/password-reset/request, POST /auth/password-reset/complete.

import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../common/auth/public.decorator';
import { deviceContextFrom } from './device-context.util';
import { PasswordResetCompleteDto } from './dto/password-reset-complete.dto';
import { PasswordResetRequestDto } from './dto/password-reset-request.dto';
import { PasswordResetService } from './password-reset.service';

@Controller('auth/password-reset')
export class PasswordResetController {
  constructor(private readonly passwordResetService: PasswordResetService) {}

  @Public()
  @Post('request')
  @HttpCode(HttpStatus.OK)
  async request(@Body() dto: PasswordResetRequestDto) {
    await this.passwordResetService.requestReset(dto);
    return {
      data: { message: 'If the account exists, an OTP has been sent.' },
    };
  }

  @Public()
  @Post('complete')
  @HttpCode(HttpStatus.OK)
  async complete(@Body() dto: PasswordResetCompleteDto, @Req() req: Request) {
    await this.passwordResetService.completeReset(dto, deviceContextFrom(req).deviceId ?? null);
    return { data: { message: 'Password reset successful.' } };
  }
}
