import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { AnnouncementsService } from './announcements.service';
import { AnnouncementQueryDto } from './dto/announcement-query.dto';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

// School-wide, role-targeted announcements -- distinct from community_announcement
// (scoped to a single community). Only ADMIN can send one today, same as every
// other Admin-panel-only module in this build; audience just picks who *would* see
// it once each role's own login exists (Finance officer / Principal logins aren't
// built yet -- see this module's own note in query.md).
@Roles('ADMIN')
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
  @HttpCode(HttpStatus.OK)
  async archive(@Param('id') id: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.announcementsService.archive(id, actor.personId) };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateAnnouncementDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.announcementsService.update(id, dto, actor.personId) };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @CurrentActor() actor: AuthenticatedUser) {
    await this.announcementsService.remove(id, actor.personId);
  }
}
