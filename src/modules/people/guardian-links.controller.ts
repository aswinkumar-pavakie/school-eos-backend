import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { UpdateGuardianLinkDto } from './dto/update-guardian-link.dto';
import { GuardianLinksService } from './guardian-links.service';

@Roles('ADMIN')
@Controller('guardian-links')
export class GuardianLinksController {
  constructor(private readonly guardianLinksService: GuardianLinksService) {}

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateGuardianLinkDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.guardianLinksService.update(id, dto, actor.personId),
    };
  }

  @Post(':id/set-primary')
  @HttpCode(HttpStatus.OK)
  async setPrimary(
    @Param('id') id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.guardianLinksService.setPrimary(id, actor.personId),
    };
  }

  @Post(':id/revoke')
  @HttpCode(HttpStatus.OK)
  async revoke(
    @Param('id') id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.guardianLinksService.revoke(id, actor.personId) };
  }
}
