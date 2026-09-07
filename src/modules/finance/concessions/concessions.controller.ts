import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentActor } from '../../../common/auth/current-actor.decorator';
import { AuthenticatedUser } from '../../../common/auth/authenticated-user.interface';
import { Roles } from '../../../common/auth/roles.decorator';
import { ConcessionsService } from './concessions.service';
import { CreateConcessionDto } from './dto/create-concession.dto';
import { ListConcessionsQueryDto } from './dto/list-concessions.query.dto';
import { UpdateConcessionDto } from './dto/update-concession.dto';

// Class-level @Roles is deliberately broadened to include PRINCIPAL for read-only
// oversight (Principal's own /principal/finance/concessions/[id] view, reached
// from an approval's "View underlying record") -- every write method below has its
// own narrower @Roles('FINANCE', 'ADMIN') that overrides the class-level one
// (RolesGuard uses Reflector.getAllAndOverride, so a method-level @Roles fully
// replaces, never merges with, the class-level one), so Principal never gains
// create/update/delete access even by calling the API directly.
@Controller('finance/concessions')
@Roles('FINANCE', 'ADMIN', 'PRINCIPAL')
export class ConcessionsController {
  constructor(private readonly service: ConcessionsService) {}

  @Get()
  async list(@Query() query: ListConcessionsQueryDto) {
    const { page, pageSize, ...filter } = query;
    const { rows, total } = await this.service.list(filter, { page, pageSize });
    return { data: rows, meta: { total, page: page ?? 1, pageSize: pageSize ?? 20 } };
  }

  @Post()
  @Roles('FINANCE', 'ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateConcessionDto, @CurrentActor() actor: AuthenticatedUser) {
    const data = await this.service.create(dto, actor);
    return { data };
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    const data = await this.service.getById(id);
    return { data };
  }

  @Patch(':id')
  @Roles('FINANCE', 'ADMIN')
  async update(@Param('id') id: string, @Body() dto: UpdateConcessionDto) {
    const data = await this.service.update(id, dto);
    return { data };
  }

  @Delete(':id')
  @Roles('FINANCE', 'ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    await this.service.delete(id);
  }
}
