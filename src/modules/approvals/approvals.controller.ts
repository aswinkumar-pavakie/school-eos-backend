// GET /approvals, POST /approvals, GET /approvals/{id}, POST /approvals/{id}/approve,
// POST /approvals/{id}/reject — Feature 1, the generic approvals engine's own HTTP
// surface. In practice most requests are created in-process by the owning feature
// (see ApprovalsService.createRequest); this POST exists for the documented contract
// and any domain service that isn't yet wired to call the engine directly.

import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { ApprovalsService } from './approvals.service';
import { CreateApprovalRequestDto } from './dto/create-approval-request.dto';
import { DecideApprovalDto } from './dto/decide-approval.dto';
import { ListApprovalsQueryDto } from './dto/list-approvals.query.dto';
import { RejectApprovalDto } from './dto/reject-approval.dto';
import { SendBackApprovalDto } from './dto/send-back-approval.dto';

@Controller('approvals')
export class ApprovalsController {
  constructor(
    private readonly approvalsService: ApprovalsService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  @Get()
  async list(@Query() query: ListApprovalsQueryDto, @CurrentActor() actor: AuthenticatedUser) {
    const data = await this.approvalsService.listForCaller(actor, query);
    return { data };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateApprovalRequestDto, @CurrentActor() actor: AuthenticatedUser) {
    const request = await this.unitOfWork.run((client) =>
      this.approvalsService.createRequest(
        {
          requestType: dto.requestType,
          subjectObjectType: dto.subjectObjectType,
          subjectObjectId: dto.subjectObjectId,
          requestedBy: actor.personId,
          payload: dto.payload,
          amountPaise: dto.amountPaise,
          isRetrospective: dto.initialState === 'RETROSPECTIVE_PENDING',
        },
        client,
      ),
    );
    return { data: request };
  }

  @Get(':id')
  async getById(@Param('id') id: string, @CurrentActor() actor: AuthenticatedUser) {
    const data = await this.approvalsService.getById(id, actor);
    return { data };
  }

  @Post(':id/withdraw')
  @HttpCode(HttpStatus.OK)
  async withdraw(@Param('id') id: string, @CurrentActor() actor: AuthenticatedUser) {
    const data = await this.approvalsService.withdraw(id, actor);
    return { data };
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  async approve(
    @Param('id') id: string,
    @Body() dto: DecideApprovalDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    const data = await this.approvalsService.approve(id, actor, dto.comment);
    return { data };
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectApprovalDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    const data = await this.approvalsService.reject(id, actor, dto.comment);
    return { data };
  }

  @Post(':id/send-back')
  @HttpCode(HttpStatus.OK)
  async sendBack(
    @Param('id') id: string,
    @Body() dto: SendBackApprovalDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    const data = await this.approvalsService.sendBack(id, actor, dto.comment);
    return { data };
  }
}
