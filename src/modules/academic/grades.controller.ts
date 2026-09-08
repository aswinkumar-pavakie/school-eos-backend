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
import { GradesService } from './grades.service';
import { CreateGradeDto } from './dto/create-grade.dto';
import { UpdateGradeDto } from './dto/update-grade.dto';

@Roles('ADMIN')
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
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateGradeDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.gradesService.create(dto, actor.personId) };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateGradeDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.gradesService.update(id, dto, actor.personId) };
  }
}
