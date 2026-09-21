import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CreateSportsInjuryDto } from './dto/create-sports-injury.dto';
import { UpdateSportsInjuryDto } from './dto/update-sports-injury.dto';
import { SportsInjuriesService } from './sports-injuries.service';

@Roles('SPORTS_ADMIN')
@Controller('sports/injuries')
export class SportsInjuriesController {
  constructor(private readonly service: SportsInjuriesService) {}

  @Get()
  async list() {
    return { data: await this.service.list() };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateSportsInjuryDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.create(actor, dto) };
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSportsInjuryDto,
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
