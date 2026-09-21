import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { AmendMovementLogEntryDto } from './dto/amend-movement-log-entry.dto';
import { CreateMovementLogEntryDto } from './dto/create-movement-log-entry.dto';
import { MovementLogService } from './movement-log.service';

@Roles('HOSTEL_WARDEN')
@Controller('hostel/movement-log')
export class MovementLogController {
  constructor(private readonly service: MovementLogService) {}

  @Get()
  async list(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.list(actor.personId) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateMovementLogEntryDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.create(dto, actor.personId) };
  }

  @Post(':id/return')
  async recordReturn(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.recordReturn(id, actor.personId) };
  }

  @Patch(':id')
  async amend(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AmendMovementLogEntryDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.amend(id, dto, actor.personId) };
  }
}
