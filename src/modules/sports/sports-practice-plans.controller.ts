import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CreatePracticePlanDto } from './dto/create-practice-plan.dto';
import { UpdatePracticePlanDto } from './dto/update-practice-plan.dto';
import { SportsPracticePlansService } from './sports-practice-plans.service';

@Roles('SPORTS_ADMIN')
@Controller('sports/practice-plans')
export class SportsPracticePlansController {
  constructor(private readonly service: SportsPracticePlansService) {}

  @Get()
  async list() {
    return { data: await this.service.list() };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreatePracticePlanDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.create(actor, dto) };
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePracticePlanDto,
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
