import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { InventoryItemQueryDto } from '../inventory/dto/inventory-item-query.dto';
import { InventoryCategoryRepository } from '../inventory/repositories/inventory-category.repository';
import { InventoryItemsService } from '../inventory/inventory-items.service';
import { CreateMediaTeamMemberDto } from './dto/create-media-team-member.dto';
import { UpdateMediaTeamMemberDto } from './dto/update-media-team-member.dto';
import { MediaTeamService } from './media-team.service';

const MEDIA_CATEGORY_NAME = 'Media & AV Equipment';

// PRINCIPAL is read-only oversight here, same as everywhere else -- every
// write method below carries its own narrower @Roles('MEDIA_ROOM', 'ADMIN')
// override (RolesGuard's Reflector.getAllAndOverride means a method-level
// @Roles fully replaces the class-level one).
@Roles('MEDIA_ROOM', 'ADMIN', 'PRINCIPAL')
@Controller('media/team')
export class MediaTeamController {
  constructor(
    private readonly service: MediaTeamService,
    private readonly itemsService: InventoryItemsService,
    private readonly categoryRepo: InventoryCategoryRepository,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  async list() {
    return { data: await this.service.list() };
  }

  // Real detail read: equipment currently held is computed by cross-
  // referencing this member's own real personId against real
  // inventory_item.assigned_to_person_id (never a fabricated per-member
  // equipment list); recent activity is this person's own real audit_event
  // rows (every action they've taken, e.g. shoots/posts/indents they
  // created). Both are honestly empty when personId is null (a roster entry
  // with no linked login).
  @Get(':id')
  async get(@Param('id') id: string) {
    const member = await this.service.getById(id);
    if (!member) throw new NotFoundException('Media team member not found');

    let equipment: string[] = [];
    let activity: { id: string; date: Date; text: string }[] = [];
    if (member.personId) {
      const categories = await this.categoryRepo.findMany();
      const mediaCategory = categories.find((c) => c.name === MEDIA_CATEGORY_NAME);
      if (mediaCategory) {
        const query = new InventoryItemQueryDto();
        query.categoryId = mediaCategory.id;
        query.limit = 500;
        query.page = 1;
        const { data: items } = await this.itemsService.list(query);
        equipment = items
          .filter((i) => i.assignedToPersonId === member.personId)
          .map((i) => i.name);
      }

      const { rows } = await this.auditService.query({ actorPersonId: member.personId, limit: 10 });
      activity = rows.map((r) => ({ id: r.id, date: r.occurredAt, text: `${r.action.replaceAll('_', ' ').toLowerCase()}` }));
    }

    const jobCounts = await this.service.getJobCounts(id);
    return { data: { ...member, equipment, activity, ...jobCounts } };
  }

  @Post()
  @Roles('MEDIA_ROOM', 'ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateMediaTeamMemberDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.create(dto, actor.personId) };
  }

  @Patch(':id')
  @Roles('MEDIA_ROOM', 'ADMIN')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateMediaTeamMemberDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.update(id, dto, actor.personId) };
  }
}
