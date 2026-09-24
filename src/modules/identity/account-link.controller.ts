// Linked account switching endpoints. Any signed-in person may call them; what they
// may DO is decided per call by the admin's mapping + this phone's link (see
// AccountLinkService).

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { AccountLinkService } from './account-link.service';
import { deviceContextFrom } from './device-context.util';
import { LinkAccountDto, SwitchAccountDto } from './dto/account-link.dto';

@Controller('auth')
export class AccountLinkController {
  constructor(private readonly service: AccountLinkService) {}

  /** Classes the admin mapped to me, and which are already linked on this phone. */
  @Get('linked-accounts/available')
  async available(@CurrentActor() actor: AuthenticatedUser, @Req() req: Request) {
    return { data: await this.service.available(actor.personId, deviceContextFrom(req)) };
  }

  /** My linked phones. */
  @Get('linked-accounts')
  async list(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.list(actor.personId) };
  }

  /** Add a mapped account (once per phone). Needs the class login's own password. */
  @Post('linked-accounts')
  @HttpCode(HttpStatus.OK)
  async link(
    @CurrentActor() actor: AuthenticatedUser,
    @Body() dto: LinkAccountDto,
    @Req() req: Request,
  ) {
    return { data: await this.service.link(actor.personId, dto, deviceContextFrom(req)) };
  }

  /** Switch to a linked account: no password, needs a live session + a link on this phone. */
  @Post('switch')
  @HttpCode(HttpStatus.OK)
  async switchTo(
    @CurrentActor() actor: AuthenticatedUser,
    @Body() dto: SwitchAccountDto,
    @Req() req: Request,
  ) {
    return { data: await this.service.switchTo(actor.personId, dto, deviceContextFrom(req)) };
  }

  /** Remove one linked phone. */
  @Delete('linked-accounts/:id')
  async remove(
    @CurrentActor() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return { data: await this.service.remove(actor.personId, id) };
  }
}
