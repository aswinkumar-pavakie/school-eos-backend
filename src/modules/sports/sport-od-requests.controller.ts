// Sports Faculty (mobile) — OD (on-duty) requests. Decisions themselves
// (approve/reject) happen on the generic engine (POST /approvals/:id/approve|
// reject by Principal), not here — mirrors PurchaseRequestsController's own
// convention.

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CreateSportOdRequestDto } from './dto/create-sport-od-request.dto';
import { SportOdRequestService } from './sport-od-request.service';

@Roles('FACULTY')
@Controller('sports/od-requests')
export class SportOdRequestsController {
  constructor(private readonly service: SportOdRequestService) {}

  @Get()
  async list(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.list(actor) };
  }

  @Get(':id')
  async get(@Param('id') id: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.get(actor, id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateSportOdRequestDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.create(actor, dto) };
  }
}
