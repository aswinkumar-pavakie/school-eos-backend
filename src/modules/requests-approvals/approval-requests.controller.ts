import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ApprovalRequestsService } from './approval-requests.service';
import { ApprovalRequestQueryDto } from './dto/approval-request-query.dto';
import { CreateApprovalRequestDto } from './dto/create-approval-request.dto';
import { DecideApprovalRequestDto } from './dto/decide-approval-request.dto';
import { ResubmitApprovalRequestDto } from './dto/resubmit-approval-request.dto';
import { SendBackApprovalRequestDto } from './dto/send-back-approval-request.dto';

// Admin -> Requests & Approvals: the small, fixed set of administrative
// requests Admin is authorized to decide (see admin-request-types.ts).
// Academic, disciplinary, staff-performance and finance-operational requests
// are deliberately not representable here at all -- there is no request_type
// this controller accepts for any of those.
@Roles('ADMIN')
@Controller('approval-requests')
export class ApprovalRequestsController {
  constructor(
    private readonly approvalRequestsService: ApprovalRequestsService,
  ) {}

  @Get()
  async list(@Query() query: ApprovalRequestQueryDto) {
    const result = await this.approvalRequestsService.list(query);
    return { data: result.data, meta: result.meta };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.approvalRequestsService.get(id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateApprovalRequestDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.approvalRequestsService.create(dto, actor.personId),
    };
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  async approve(
    @Param('id') id: string,
    @Body() dto: DecideApprovalRequestDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.approvalRequestsService.approve(id, dto, actor.personId),
    };
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  async reject(
    @Param('id') id: string,
    @Body() dto: DecideApprovalRequestDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.approvalRequestsService.reject(id, dto, actor.personId),
    };
  }

  @Post(':id/send-back')
  @HttpCode(HttpStatus.OK)
  async sendBack(
    @Param('id') id: string,
    @Body() dto: SendBackApprovalRequestDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.approvalRequestsService.sendBack(
        id,
        dto,
        actor.personId,
      ),
    };
  }

  @Post(':id/resubmit')
  @HttpCode(HttpStatus.OK)
  async resubmit(
    @Param('id') id: string,
    @Body() dto: ResubmitApprovalRequestDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.approvalRequestsService.resubmit(
        id,
        dto,
        actor.personId,
      ),
    };
  }
}
