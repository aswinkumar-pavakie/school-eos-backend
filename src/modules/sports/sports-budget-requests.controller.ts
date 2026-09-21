// Sports Admin "Budget & approvals" -- reuses Finance's own purchase_request
// engine as-is (see 0024_sports_budget_approval_policy.sql's own header
// comment for why), requestType='SERVICE' since a budget ask has no
// physical item, routed through the real, live 2-step Principal-then-
// Finance policy under its own SPORTS_BUDGET_REQUEST type -- same reuse
// shape as SportsEquipmentIndentsController.

import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ListPurchaseRequestsQueryDto } from '../finance/purchase-requests/dto/list-purchase-requests.query.dto';
import { PurchaseRequestsService } from '../finance/purchase-requests/purchase-requests.service';
import { CreateSportsBudgetRequestDto } from './dto/create-sports-budget-request.dto';

const SPORTS_BUDGET_CONTEXT = {
  approvalRequestType: 'SPORTS_BUDGET_REQUEST',
  actorRoleCode: 'SPORTS_ADMIN',
};

@Roles('SPORTS_ADMIN')
@Controller('sports/budget-requests')
export class SportsBudgetRequestsController {
  constructor(private readonly purchaseRequestsService: PurchaseRequestsService) {}

  @Get()
  async list(@Query() query: ListPurchaseRequestsQueryDto, @CurrentActor() actor: AuthenticatedUser) {
    const { page, pageSize, ...filter } = query;
    const { rows, total } = await this.purchaseRequestsService.list(
      { ...filter, requestType: 'SERVICE' },
      { page, pageSize },
      actor,
    );
    return { data: rows, meta: { total, page: page ?? 1, pageSize: pageSize ?? 20 } };
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return { data: await this.purchaseRequestsService.getById(id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateSportsBudgetRequestDto, @CurrentActor() actor: AuthenticatedUser) {
    const data = await this.purchaseRequestsService.create(
      {
        requestType: 'SERVICE',
        itemName: dto.title,
        description: dto.description,
        estimatedAmountPaise: dto.estimatedAmountPaise,
      },
      actor,
      SPORTS_BUDGET_CONTEXT,
    );
    return { data };
  }
}
