import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CommunityAnnouncementsService } from './community-announcements.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

// Class-level role broadened to PRINCIPAL for read-only oversight (Phase 17),
// and to COMMUNITY (Phase 4 of the separate standalone-Community-login
// initiative). COMMUNITY was originally read-only there too; now broadened
// further so a Community login can send its own notices directly (no
// approval gate -- same direct-publish authority Admin already has over
// these same rows, just scoped to the caller's own community). PRINCIPAL
// stays read-only -- not part of this request, no method-level override
// added for it.
// These are community-scoped announcements (posts within one community),
// distinct from the separate, school-wide Announcements sidebar module --
// not a duplicate, no cross-module boundary crossed.
// VICE_PRINCIPAL added (Vice Principal mobile Communities module) -- same
// read-only tier as Principal; create/update stay ADMIN/COMMUNITY-only,
// unaffected since those keep their own narrower method-level override.
@Roles('ADMIN', 'PRINCIPAL', 'COMMUNITY', 'VICE_PRINCIPAL')
@Controller()
export class CommunityAnnouncementsController {
  constructor(
    private readonly announcementsService: CommunityAnnouncementsService,
  ) {}

  @Get('communities/:id/announcements')
  async list(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.announcementsService.listByCommunity(id) };
  }

  @Post('communities/:id/announcements')
  @Roles('ADMIN', 'COMMUNITY')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAnnouncementDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.announcementsService.create(id, dto, actor),
    };
  }

  @Patch('community-announcements/:announcementId')
  @Roles('ADMIN', 'COMMUNITY')
  async update(
    @Param('announcementId', ParseUUIDPipe) announcementId: string,
    @Body() dto: UpdateAnnouncementDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.announcementsService.update(
        announcementId,
        dto,
        actor,
      ),
    };
  }
}
