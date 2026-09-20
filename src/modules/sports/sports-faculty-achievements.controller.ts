// Feature #15 — achievements.

import {
  Body,
  Controller,
  Delete,
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
import { CreateSportsAchievementDto } from './dto/create-sports-achievement.dto';
import { UpdateSportsAchievementDto } from './dto/update-sports-achievement.dto';
import { SportsFacultyAchievementsService } from './sports-faculty-achievements.service';

@Roles('FACULTY', 'SPORTS_ADMIN')
@Controller('sports/achievements')
export class SportsFacultyAchievementsController {
  constructor(private readonly service: SportsFacultyAchievementsService) {}

  @Get()
  async list(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.list(actor) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateSportsAchievementDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.create(actor, dto) };
  }

  // Edit/Delete for the Sports Admin console's own Achievements screen --
  // genuinely unbuilt before this.
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSportsAchievementDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.update(actor, id, dto) };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(@Param('id') id: string, @CurrentActor() actor: AuthenticatedUser) {
    await this.service.delete(actor, id);
    return { data: { deleted: true } };
  }
}
