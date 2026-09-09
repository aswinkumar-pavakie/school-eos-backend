// "Raise a restock request" — reuses Finance's own purchase_request/
// purchase_order tables and PurchaseRequestsService as-is (see
// PurchaseRequestsService.create()'s own context param), routed through the
// generic approvals engine via the separate SPORTS_EQUIPMENT_REQUEST policy
// (PRINCIPAL then FINANCE — see query.md), exactly the same reuse shape as
// MediaIndentsController already established for Media Room.

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { SPORTS_ERRORS } from '../../common/errors/error-codes';
import { PurchaseRequestsService } from '../finance/purchase-requests/purchase-requests.service';
import { ListPurchaseRequestsQueryDto } from '../finance/purchase-requests/dto/list-purchase-requests.query.dto';
import { CreateSportsEquipmentIndentDto } from './dto/create-sports-equipment-indent.dto';
import { EquipmentRepository } from './repositories/equipment.repository';
import { SportsFacultyRepository } from './repositories/sports-faculty.repository';
import { StaffRepository } from './repositories/staff.repository';

const SPORTS_EQUIPMENT_CONTEXT = {
  approvalRequestType: 'SPORTS_EQUIPMENT_REQUEST',
  actorRoleCode: 'SPORTS_FACULTY',
};

@Roles('FACULTY', 'ADMIN', 'PRINCIPAL', 'FINANCE')
@Controller('sports/equipment-indents')
export class SportsEquipmentIndentsController {
  constructor(
    private readonly purchaseRequestsService: PurchaseRequestsService,
    private readonly equipmentRepo: EquipmentRepository,
    private readonly sportsFacultyRepo: SportsFacultyRepository,
    private readonly staffRepo: StaffRepository,
  ) {}

  @Get()
  async list(
    @Query() query: ListPurchaseRequestsQueryDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    const { page, pageSize, ...filter } = query;
    const { rows, total } = await this.purchaseRequestsService.list(
      filter,
      { page, pageSize },
      actor,
    );
    return {
      data: rows,
      meta: { total, page: page ?? 1, pageSize: pageSize ?? 20 },
    };
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return { data: await this.purchaseRequestsService.getById(id) };
  }

  @Post()
  @Roles('FACULTY')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateSportsEquipmentIndentDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    const staff = await this.staffRepo.findByPersonId(actor.personId);
    if (!staff || staff.status !== 'ACTIVE')
      throw new NotFoundException(SPORTS_ERRORS.NOT_ACTIVE_FACULTY);

    const equipment = await this.equipmentRepo.findById(dto.equipmentId);
    if (!equipment || !equipment.sportId)
      throw new NotFoundException(SPORTS_ERRORS.EQUIPMENT_NOT_FOUND);
    const authorized = await this.sportsFacultyRepo.isAuthorizedForSport(
      actor.personId,
      equipment.sportId,
    );
    if (!authorized)
      throw new NotFoundException(SPORTS_ERRORS.EQUIPMENT_NOT_FOUND);

    // No equipmentId field exists on PurchaseRequestsService.create()'s input
    // (nor a column for it on purchase_request) -- this merge found the
    // current, live shape of that service has evolved since this controller
    // was first written against it. The equipment link is still preserved
    // for a human reader via itemName (equipment.name) below; a real FK back
    // to a specific equipment row would need a schema change, out of scope
    // here.
    const data = await this.purchaseRequestsService.create(
      {
        requestType: 'GOODS',
        itemName: equipment.name,
        quantity: dto.quantity,
        vendorName: dto.vendorName,
        description: dto.reason,
      },
      actor,
      SPORTS_EQUIPMENT_CONTEXT,
    );
    return { data };
  }
}
