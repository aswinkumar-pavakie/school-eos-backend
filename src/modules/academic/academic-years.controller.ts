import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { AcademicYearsService } from './academic-years.service';
import { CreateAcademicYearDto } from './dto/create-academic-year.dto';
import { UpdateAcademicYearDto } from './dto/update-academic-year.dto';

// Class-level @Roles broadened to include PRINCIPAL for read-only oversight
// (Principal's Students module needs grade/section/academic-year names for
// enrolment display), and to VICE_PRINCIPAL (Phase 8 mobile Academics module
// -- same read-only oversight need) -- every write method below has its own
// narrower @Roles('ADMIN') override (RolesGuard's Reflector.getAllAndOverride
// means a method-level @Roles fully replaces the class-level one), so neither
// Principal nor Vice Principal ever gains create/update/set-current/close
// access even by calling the API directly.
@Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL')
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
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateAcademicYearDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.academicYearsService.create(dto, actor.personId) };
  }

  @Patch(':id')
  @Roles('ADMIN')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAcademicYearDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.academicYearsService.update(id, dto, actor.personId) };
  }

  @Post(':id/set-current')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async setCurrent(@Param('id') id: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.academicYearsService.setCurrent(id, actor.personId) };
  }

  @Post(':id/close')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async close(@Param('id') id: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.academicYearsService.close(id, actor.personId) };
  }
}
