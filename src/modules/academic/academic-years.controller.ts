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
import { AcademicYearsService } from './academic-years.service';
import { CreateAcademicYearDto } from './dto/create-academic-year.dto';
import { UpdateAcademicYearDto } from './dto/update-academic-year.dto';

@Roles('ADMIN')
@Controller('academic-years')
export class AcademicYearsController {
  constructor(private readonly academicYearsService: AcademicYearsService) {}

  @Get()
  async list() {
    return { data: await this.academicYearsService.list() };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.academicYearsService.get(id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateAcademicYearDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.academicYearsService.create(dto, actor.personId),
    };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAcademicYearDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.academicYearsService.update(id, dto, actor.personId),
    };
  }

  @Post(':id/set-current')
  @HttpCode(HttpStatus.OK)
  async setCurrent(
    @Param('id') id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.academicYearsService.setCurrent(id, actor.personId),
    };
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  async close(
    @Param('id') id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.academicYearsService.close(id, actor.personId) };
  }
}
