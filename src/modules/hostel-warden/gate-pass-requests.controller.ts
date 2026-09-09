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
import { DecideApprovalDto } from '../approvals/dto/decide-approval.dto';
import { RejectApprovalDto } from '../approvals/dto/reject-approval.dto';
import { GATE_PASS_REQUEST_TYPE } from './repositories/outing-request.repository';
import { OutingRequestsSharedService } from './outing-requests-shared.service';

@Roles('HOSTEL_WARDEN')
@Controller('hostel/gate-pass-requests')
export class GatePassRequestsController {
  constructor(private readonly service: OutingRequestsSharedService) {}

  @Get()
  async list(@CurrentActor() actor: AuthenticatedUser) {
    return {
      data: await this.service.list(actor.personId, GATE_PASS_REQUEST_TYPE),
    };
  }

  @Get(':id')
  async get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.service.get(id, actor.personId, GATE_PASS_REQUEST_TYPE),
    };
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideApprovalDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.service.approve(
        id,
        actor,
        GATE_PASS_REQUEST_TYPE,
        dto.comment,
      ),
    };
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectApprovalDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.service.reject(
        id,
        actor,
        GATE_PASS_REQUEST_TYPE,
        dto.comment,
      ),
    };
  }
}
