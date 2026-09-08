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
import { CommunityActivitiesService } from './community-activities.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';

@Roles('ADMIN')
@Controller()
export class CommunityActivitiesController {
  constructor(private readonly activitiesService: CommunityActivitiesService) {}

  @Get('communities/:id/activities')
  async list(@Param('id') id: string) {
    return { data: await this.activitiesService.listByCommunity(id) };
  }

  @Post('communities/:id/activities')
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
