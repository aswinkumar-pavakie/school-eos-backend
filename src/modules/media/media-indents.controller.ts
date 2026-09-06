// "Raise indent" -- reuses Finance's own purchase_request/purchase_order tables
// and PurchaseRequestsService as-is (see database/migrations/0006_media_room.sql
// and PurchaseRequestsService.create()'s own context param), routed to Principal
// directly via the separate MEDIA_INDENT approval_policy, not through Finance.

import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CreatePurchaseRequestDto } from '../finance/purchase-requests/dto/create-purchase-request.dto';
import { ListPurchaseRequestsQueryDto } from '../finance/purchase-requests/dto/list-purchase-requests.query.dto';
import { PurchaseRequestsService } from '../finance/purchase-requests/purchase-requests.service';

const MEDIA_INDENT_CONTEXT = { approvalRequestType: 'MEDIA_INDENT', actorRoleCode: 'MEDIA_ROOM' };

@Roles('MEDIA_ROOM', 'ADMIN', 'PRINCIPAL')
@Controller('media/indents')
export class MediaIndentsController {
  constructor(private readonly service: PurchaseRequestsService) {}

  @Get()
  async list(@Query() query: ListPurchaseRequestsQueryDto, @CurrentActor() actor: AuthenticatedUser) {
    const { page, pageSize, ...filter } = query;
    const { rows, total } = await this.service.list(filter, { page, pageSize }, actor);
    return { data: rows, meta: { total, page: page ?? 1, pageSize: pageSize ?? 20 } };
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return { data: await this.service.getById(id) };
  }

  @Post()
  @Roles('MEDIA_ROOM')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreatePurchaseRequestDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.create(dto, actor, MEDIA_INDENT_CONTEXT) };
  }
}
