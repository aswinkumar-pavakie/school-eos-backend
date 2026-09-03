// POST /admin/parents/:personId/password-reset — ADMIN-only, clears reset_allowance_used.

import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator';
import { AdminPasswordResetDto } from './dto/admin-password-reset.dto';
import { PasswordResetService } from './password-reset.service';

@Controller('admin/parents')
export class AdminIdentityController {
  constructor(private readonly passwordResetService: PasswordResetService) {}

  @Roles('ADMIN')
  @Post(':personId/password-reset')
  @HttpCode(HttpStatus.OK)
  async resetParentPassword(
    @Param('personId') personId: string,
    @Body() dto: AdminPasswordResetDto,
  ) {
    const result = await this.passwordResetService.adminReset(personId, dto);
    return { data: result };
  }
}
