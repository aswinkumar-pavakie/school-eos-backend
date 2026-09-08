import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { GradesService } from './grades.service';
import { CreateGradeDto } from './dto/create-grade.dto';
import { UpdateGradeDto } from './dto/update-grade.dto';

// Class-level @Roles broadened to include PRINCIPAL for read-only oversight
// (Principal's Students module needs grade names for filters/enrolment display) --
// write methods below have their own narrower @Roles('ADMIN') override.
@Roles('ADMIN', 'PRINCIPAL')
@Controller('grades')
export class GradesController {
  constructor(private readonly gradesService: GradesService) {}

  @Get()
  async list() {
    return { data: await this.gradesService.list() };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.gradesService.get(id) };
  }

  @Post()
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateGradeDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.gradesService.create(dto, actor.personId) };
  }

  @Patch(':id')
  @Roles('ADMIN')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateGradeDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.gradesService.update(id, dto, actor.personId) };
  }
}
