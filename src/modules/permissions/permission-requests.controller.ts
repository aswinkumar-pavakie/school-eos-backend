// PARENT: GET /api/v1/permissions/requests, GET .../:requestId,
// POST .../:requestId/consent, POST .../:requestId/decline -- view and respond to
// the per-student permission requests for the caller's own, currently-active
// wards only. All authorization/business logic lives in PermissionRequestService;
// this controller only wires HTTP shape.

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { DeclinePermissionRequestDto } from './dto/decline-permission-request.dto';
import { PermissionRequestService } from './permission-request.service';

@Controller('permissions/requests')
export class PermissionRequestsController {
  constructor(private readonly requestService: PermissionRequestService) {}

  @Roles('PARENT')
  @Get()
  async list(@CurrentActor() actor: AuthenticatedUser) {
    const result = await this.requestService.list(actor);
    return { data: result };
  }

  @Roles('PARENT')
  @Get(':requestId')
  async detail(
    @CurrentActor() actor: AuthenticatedUser,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
  ) {
    const result = await this.requestService.detail(actor, requestId);
    return { data: result };
  }

  @Roles('PARENT')
  @Post(':requestId/consent')
  @HttpCode(HttpStatus.OK)
  async consent(
    @CurrentActor() actor: AuthenticatedUser,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
  ) {
    const result = await this.requestService.consent(actor, requestId);
    return { data: result };
  }

  @Roles('PARENT')
  @Post(':requestId/decline')
  @HttpCode(HttpStatus.OK)
  async decline(
    @CurrentActor() actor: AuthenticatedUser,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Body() dto: DeclinePermissionRequestDto,
  ) {
    const result = await this.requestService.decline(actor, requestId, dto);
    return { data: result };
  }
}
