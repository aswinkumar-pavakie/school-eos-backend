// Sports Faculty (mobile) — day-to-day equipment issue/return against Admin's
// master inventory. Equipment itself is read-only here (create/edit stays on
// EquipmentController, @Roles('ADMIN')) — see sports.module.ts's own header
// comment on the Setup/Operations split.

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { SPORTS_ERRORS } from '../../common/errors/error-codes';
import { IssueEquipmentDto } from './dto/issue-equipment.dto';
import { ReturnEquipmentDto } from './dto/return-equipment.dto';
import { SportsEquipmentOperationsService } from './sports-equipment-operations.service';

@Roles('FACULTY')
@Controller('sports/faculty/equipment')
export class SportsEquipmentOperationsController {
  constructor(private readonly service: SportsEquipmentOperationsService) {}

  @Get()
  async list(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.listMyEquipment(actor) };
  }

  @Get('outstanding-issues')
  async listOutstanding(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.listOutstanding(actor) };
  }

  @Get('overdue-issues')
  async listOverdue(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.listOverdue(actor) };
  }

  @Get('low-stock')
  async listLowStock(
    @Query('threshold') threshold: string | undefined,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    const parsed = threshold !== undefined ? parseInt(threshold, 10) : 5;
    return {
      data: await this.service.listLowStock(
        actor,
        Number.isFinite(parsed) ? parsed : 5,
      ),
    };
  }

  @Post(':id/issues')
  @HttpCode(HttpStatus.CREATED)
  async issue(
    @Param('id') id: string,
    @Body() dto: IssueEquipmentDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    if (!idempotencyKey)
      throw new BadRequestException(SPORTS_ERRORS.IDEMPOTENCY_KEY_REQUIRED);
    return { data: await this.service.issue(actor, id, dto, idempotencyKey) };
  }

  @Post('issues/:issueId/return')
  @HttpCode(HttpStatus.OK)
  async returnEquipment(
    @Param('issueId') issueId: string,
    @Body() dto: ReturnEquipmentDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.recordReturn(actor, issueId, dto) };
  }
}
