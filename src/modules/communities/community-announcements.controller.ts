import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CommunityAnnouncementsService } from './community-announcements.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

@Roles('ADMIN')
@Controller()
export class CommunityAnnouncementsController {
  constructor(
    private readonly announcementsService: CommunityAnnouncementsService,
  ) {}

  @Get('communities/:id/announcements')
  async list(@Param('id') id: string) {
    return { data: await this.announcementsService.listByCommunity(id) };
  }

  @Post('communities/:id/announcements')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('id') id: string,
    @Body() dto: CreateAnnouncementDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.announcementsService.create(id, dto, actor.personId),
    };
  }

  @Patch('community-announcements/:announcementId')
  async update(
    @Param('announcementId') announcementId: string,
    @Body() dto: UpdateAnnouncementDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.announcementsService.update(
        announcementId,
        dto,
        actor.personId,
      ),
    };
  }
}
