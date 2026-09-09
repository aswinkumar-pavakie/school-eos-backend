// Principal raises a Purchase Request (GOODS) / Service Request (SERVICE); it routes
// through the generic approvals engine to Finance (see database/migrations/
// 0004_purchase_requests.sql's PURCHASE_REQUEST policy row). Approve/reject itself
// happens via the generic engine (POST /approvals/:id/approve|reject), not a
// Finance-specific endpoint here — mirrors ExpensesController's convention. Once
// approved, PurchaseRequestsService auto-creates the linked purchase_order, and
// Finance tracks its physical fulfillment through the stage/allot endpoints below.

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
import { CurrentActor } from '../../../common/auth/current-actor.decorator';
import { AuthenticatedUser } from '../../../common/auth/authenticated-user.interface';
import { Roles } from '../../../common/auth/roles.decorator';
import {
  AllotOrderDto,
  UpdateOrderStageDto,
} from './dto/update-order-stage.dto';
import { CreatePurchaseRequestDto } from './dto/create-purchase-request.dto';
import {
  ListPurchaseOrdersQueryDto,
  ListPurchaseRequestsQueryDto,
  RequestTypeSummaryQueryDto,
} from './dto/list-purchase-requests.query.dto';
import { PurchaseRequestsService } from './purchase-requests.service';

@Controller('finance/purchase-requests')
@Roles('FINANCE', 'ADMIN', 'PRINCIPAL')
export class PurchaseRequestsController {
  constructor(private readonly service: PurchaseRequestsService) {}

  @Post()
  @Roles('PRINCIPAL')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreatePurchaseRequestDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    const data = await this.service.create(dto, actor);
    return { data };
  }

  @Get()
  async list(
    @Query() query: ListPurchaseRequestsQueryDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    const { page, pageSize, ...filter } = query;
    const { rows, total } = await this.service.list(
      filter,
      { page, pageSize },
      actor,
    );
    return {
      data: rows,
      meta: { total, page: page ?? 1, pageSize: pageSize ?? 20 },
    };
  }

  // Registered before ":id" — Nest matches routes in declaration order, and "summary"
  // would otherwise be swallowed as an :id param.
  @Get('summary')
  async summary(@Query() query: RequestTypeSummaryQueryDto) {
    const data = await this.service.summary(query.requestType);
    return { data };
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    const data = await this.service.getById(id);
    return { data };
  }
}

@Controller('finance/purchase-orders')
@Roles('FINANCE', 'ADMIN')
export class PurchaseOrdersController {
  constructor(private readonly service: PurchaseRequestsService) {}

  @Get()
  async list(@Query() query: ListPurchaseOrdersQueryDto) {
    const { page, pageSize, ...filter } = query;
    const { rows, total } = await this.service.listOrders(filter, {
      page,
      pageSize,
    });
    return {
      data: rows,
      meta: { total, page: page ?? 1, pageSize: pageSize ?? 20 },
    };
  }

  @Get('summary')
  async summary(@Query() query: RequestTypeSummaryQueryDto) {
    const data = await this.service.ordersSummary(query.requestType);
    return { data };
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    const data = await this.service.getOrderById(id);
    return { data };
  }

  @Post(':id/update-stage')
  @HttpCode(HttpStatus.OK)
  async updateStage(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStageDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    const data = await this.service.updateOrderStage(id, dto, actor);
    return { data };
  }

  @Post(':id/allot')
  @HttpCode(HttpStatus.OK)
  async allot(
    @Param('id') id: string,
    @Body() dto: AllotOrderDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    const data = await this.service.allotOrder(id, dto, actor);
    return { data };
  }
}
