import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

// Class-level @Roles broadened to include PRINCIPAL for read-only oversight
// (Principal's Academics module), and to VICE_PRINCIPAL (Phase 8 mobile
// Academics module -- same read-only oversight need) -- write methods below
// have their own narrower @Roles('ADMIN') override.
@Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL')
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get()
  async list() {
    return { data: await this.departmentsService.list() };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.departmentsService.get(id) };
  }

  @Post()
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateDepartmentDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.departmentsService.create(dto, actor.personId) };
  }

  @Patch(':id')
  @Roles('ADMIN')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateDepartmentDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.departmentsService.update(id, dto, actor.personId) };
  }
}
