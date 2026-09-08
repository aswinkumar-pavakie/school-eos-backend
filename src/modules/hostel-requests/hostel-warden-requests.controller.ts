import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { RejectApprovalDto } from '../approvals/dto/reject-approval.dto';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ApproveCallRequestDto } from './dto/approve-call-request.dto';
import { ApproveOutingRequestDto } from './dto/approve-outing-request.dto';
import { HostelWardenRequestsService } from './hostel-warden-requests.service';

@Roles('HOSTEL_WARDEN')
@Controller('hostel/gate-pass-requests')
export class HostelWardenGatePassController {
  constructor(private readonly service: HostelWardenRequestsService) {}

  @Get()
  async list(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.listOuting(actor.personId, 'GATE_PASS') };
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.getOuting(actor.personId, 'GATE_PASS', id) };
  }

  @Post(':id/approve')
  async approve(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ApproveOutingRequestDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.decideOuting(actor.personId, 'GATE_PASS', id, 'APPROVED', dto.comment ?? null) };
  }

  @Post(':id/reject')
  async reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectApprovalDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.decideOuting(actor.personId, 'GATE_PASS', id, 'REJECTED', dto.comment) };
  }
}

@Roles('HOSTEL_WARDEN')
@Controller('hostel/emergency-exit-requests')
export class HostelWardenEmergencyExitController {
  constructor(private readonly service: HostelWardenRequestsService) {}

  @Get()
  async list(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.listOuting(actor.personId, 'EMERGENCY_EXIT') };
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.getOuting(actor.personId, 'EMERGENCY_EXIT', id) };
  }

  @Post(':id/approve')
  async approve(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ApproveOutingRequestDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.decideOuting(actor.personId, 'EMERGENCY_EXIT', id, 'APPROVED', dto.comment ?? null) };
  }

  @Post(':id/reject')
  async reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectApprovalDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.decideOuting(actor.personId, 'EMERGENCY_EXIT', id, 'REJECTED', dto.comment) };
  }
}

@Roles('HOSTEL_WARDEN')
@Controller('hostel/call-requests')
export class HostelWardenCallRequestsController {
  constructor(private readonly service: HostelWardenRequestsService) {}

  @Get()
  async list(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.listCalls(actor.personId) };
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.getCall(actor.personId, id) };
  }

  @Post(':id/approve')
  async approve(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ApproveCallRequestDto, @CurrentActor() actor: AuthenticatedUser) {
    return {
      data: await this.service.decideCall(actor.personId, id, { status: 'APPROVED', approvedFrom: dto.approvedFrom, approvedTo: dto.approvedTo }),
    };
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  async reject(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.decideCall(actor.personId, id, { status: 'REJECTED' }) };
  }
}
