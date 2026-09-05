import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { Roles } from '../../../common/auth/roles.decorator';
import { CurrentActor } from '../../../common/auth/current-actor.decorator';
import { AuthenticatedUser } from '../../../common/auth/authenticated-user.interface';
import { CreateImportJobDto } from './dto/create-import-job.dto';
import { ImportRowsDto } from './dto/import-rows.dto';
import { ListImportJobsQueryDto } from './dto/list-import-jobs.query.dto';
import { ObligationImportsService } from './obligation-imports.service';

@Controller('finance/obligation-imports')
@Roles('FINANCE', 'ADMIN')
export class ObligationImportsController {
  constructor(private readonly service: ObligationImportsService) {}

  @Get()
  async list(@Query() query: ListImportJobsQueryDto) {
    const { page, pageSize, ...filter } = query;
    const { rows, total } = await this.service.list(filter, { page, pageSize });
    return { data: rows, meta: { total, page: page ?? 1, pageSize: pageSize ?? 20 } };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateImportJobDto, @CurrentActor() actor: AuthenticatedUser) {
    const data = await this.service.create({ ...dto, createdBy: actor.personId });
    return { data };
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    const data = await this.service.getById(id);
    return { data };
  }

  @Post(':id/validate')
  @HttpCode(HttpStatus.OK)
  async validate(@Param('id') id: string, @Body() dto: ImportRowsDto) {
    const data = await this.service.validate(id, dto.rows);
    return { data };
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  async confirm(@Param('id') id: string, @Body() dto: ImportRowsDto) {
    const data = await this.service.confirm(id, dto.rows);
    return { data };
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(@Param('id') id: string) {
    const data = await this.service.cancel(id);
    return { data };
  }
}
