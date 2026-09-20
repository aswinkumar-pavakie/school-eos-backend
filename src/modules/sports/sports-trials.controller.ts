import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CreateSportsTrialDto } from './dto/create-sports-trial.dto';
import { UpdateSportsTrialDto } from './dto/update-sports-trial.dto';
import { SportsTrialsService } from './sports-trials.service';

// Real, school-wide -- Sports Admin's own screen, not a per-sport FACULTY
// concern the way Achievements/Training are, so this stays SPORTS_ADMIN-only.
@Roles('SPORTS_ADMIN')
@Controller('sports/trials')
export class SportsTrialsController {
  constructor(private readonly service: SportsTrialsService) {}

  @Get()
  async list() {
    return { data: await this.service.list() };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateSportsTrialDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.create(actor, dto) };
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSportsTrialDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.update(actor, id, dto) };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: AuthenticatedUser) {
    await this.service.delete(actor, id);
    return { data: { deleted: true } };
  }
}
