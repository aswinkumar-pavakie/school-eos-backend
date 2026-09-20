import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CreateSubstituteCoachDto } from './dto/create-substitute-coach.dto';
import { UpdateSubstituteCoachDto } from './dto/update-substitute-coach.dto';
import { SportsSubstituteCoachesService } from './sports-substitute-coaches.service';

@Roles('SPORTS_ADMIN')
@Controller('sports/substitute-coaches')
export class SportsSubstituteCoachesController {
  constructor(private readonly service: SportsSubstituteCoachesService) {}

  @Get()
  async list() {
    return { data: await this.service.list() };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateSubstituteCoachDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.create(actor, dto) };
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubstituteCoachDto,
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
