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
import { CommunityActivitiesService } from './community-activities.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';

// Class-level role broadened to PRINCIPAL for read-only oversight (Phase 17),
// and to COMMUNITY (Phase 4 of the separate standalone-Community-login
// initiative -- same read-only tier) -- every write method below keeps its
// own narrower @Roles('ADMIN') override.
@Roles('ADMIN', 'PRINCIPAL', 'COMMUNITY')
@Controller()
export class CommunityActivitiesController {
  constructor(private readonly activitiesService: CommunityActivitiesService) {}

  @Get('communities/:id/activities')
  async list(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.activitiesService.listByCommunity(id) };
  }

  @Post('communities/:id/activities')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('id') id: string,
    @Body() dto: CreateActivityDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.activitiesService.create(id, dto, actor.personId),
    };
  }

  @Patch('community-activities/:activityId')
  @Roles('ADMIN')
  async update(
    @Param('activityId') activityId: string,
    @Body() dto: UpdateActivityDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.activitiesService.update(
        activityId,
        dto,
        actor.personId,
      ),
    };
  }
}
