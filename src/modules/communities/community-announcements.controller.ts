import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CommunityAnnouncementsService } from './community-announcements.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

// Class-level role broadened to PRINCIPAL for read-only oversight (Phase 17);
// every write method below keeps its own narrower @Roles('ADMIN') override.
// These are community-scoped announcements (posts within one community),
// distinct from the separate, school-wide Announcements sidebar module --
// not a duplicate, no cross-module boundary crossed.
@Roles('ADMIN', 'PRINCIPAL')
@Controller()
export class CommunityAnnouncementsController {
  constructor(private readonly announcementsService: CommunityAnnouncementsService) {}

  @Get('communities/:id/announcements')
  async list(@Param('id') id: string) {
    return { data: await this.announcementsService.listByCommunity(id) };
  }

  @Post('communities/:id/announcements')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('id') id: string,
    @Body() dto: CreateAnnouncementDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.announcementsService.create(id, dto, actor.personId) };
  }

  @Patch('community-announcements/:announcementId')
  @Roles('ADMIN')
  async update(
    @Param('announcementId') announcementId: string,
    @Body() dto: UpdateAnnouncementDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.announcementsService.update(announcementId, dto, actor.personId) };
  }
}
