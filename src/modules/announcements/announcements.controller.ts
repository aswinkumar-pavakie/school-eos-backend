import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { AnnouncementsService } from './announcements.service';
import { AnnouncementQueryDto } from './dto/announcement-query.dto';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';

// School-wide, role-targeted announcements -- distinct from community_announcement
// (scoped to a single community). Principal added (Phase 18): the approved API
// doc names "Admin/leadership/authorized role" for POST /announcements
// specifically -- Principal creates announcements with the same parity as
// Admin, no method-level override needed on create. archive is NOT extended:
// the doc's "leadership" callout is specific to the create line only: every
// other action (schedule/publish/cancel/expire in the doc; archive is the one
// actually implemented) is just "Authorized role" generically, so archive
// stays Admin-only until that's explicitly documented for leadership too.
@Roles('ADMIN', 'PRINCIPAL')
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Get()
  async list(@Query() query: AnnouncementQueryDto) {
    return { data: await this.announcementsService.list(query) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateAnnouncementDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.announcementsService.create(dto, actor.personId) };
  }

  @Post(':id/archive')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async archive(@Param('id') id: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.announcementsService.archive(id, actor.personId) };
  }
}
