// Feature #15 — achievements.

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CreateSportsAchievementDto } from './dto/create-sports-achievement.dto';
import { SportsFacultyAchievementsService } from './sports-faculty-achievements.service';

@Roles('FACULTY')
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
}
