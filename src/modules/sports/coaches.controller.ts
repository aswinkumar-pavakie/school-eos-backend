import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CoachesService } from './coaches.service';
import { CreateCoachDto } from './dto/create-coach.dto';
import { UpdateCoachDto } from './dto/update-coach.dto';

@Roles('ADMIN')
@Controller('coaches')
export class CoachesController {
  constructor(private readonly coachesService: CoachesService) {}

  @Get()
  async list() {
    return { data: await this.coachesService.list() };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.coachesService.get(id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateCoachDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.coachesService.create(dto, actor.personId) };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCoachDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.coachesService.update(id, dto, actor.personId) };
  }
}
