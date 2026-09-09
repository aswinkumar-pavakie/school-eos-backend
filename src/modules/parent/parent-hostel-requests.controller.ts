import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import {
  EMERGENCY_EXIT_REQUEST_TYPE,
  GATE_PASS_REQUEST_TYPE,
} from '../hostel-warden/repositories/outing-request.repository';
import { CreateEmergencyExitRequestDto } from './dto/create-emergency-exit-request.dto';
import { CreateGatePassRequestDto } from './dto/create-gate-pass-request.dto';
import { ParentHostelRequestsService } from './parent-hostel-requests.service';

// Parent-initiated only -- the Warden never creates these on a parent's behalf (see
// src/modules/hostel-warden's gate-pass-requests.controller.ts /
// emergency-exit-requests.controller.ts for the Warden's own review/approve/reject
// side of the same underlying outing_request rows).
@Roles('PARENT')
@Controller('parent/hostel')
export class ParentHostelRequestsController {
  constructor(private readonly service: ParentHostelRequestsService) {}

  @Get('gate-pass-requests')
  async listGatePassRequests(@CurrentActor() actor: AuthenticatedUser) {
    return {
      data: await this.service.list(actor.personId, GATE_PASS_REQUEST_TYPE),
    };
  }

  @Post('gate-pass-requests')
  @HttpCode(HttpStatus.CREATED)
  async createGatePassRequest(
    @Body() dto: CreateGatePassRequestDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.service.createGatePassRequest(dto, actor.personId),
    };
  }

  @Get('emergency-exit-requests')
  async listEmergencyExitRequests(@CurrentActor() actor: AuthenticatedUser) {
    return {
      data: await this.service.list(
        actor.personId,
        EMERGENCY_EXIT_REQUEST_TYPE,
      ),
    };
  }

  @Post('emergency-exit-requests')
  @HttpCode(HttpStatus.CREATED)
  async createEmergencyExitRequest(
    @Body() dto: CreateEmergencyExitRequestDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.service.createEmergencyExitRequest(dto, actor.personId),
    };
  }
}
