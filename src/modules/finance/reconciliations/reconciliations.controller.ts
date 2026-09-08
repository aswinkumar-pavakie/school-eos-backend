import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { CurrentActor } from '../../../common/auth/current-actor.decorator';
import { AuthenticatedUser } from '../../../common/auth/authenticated-user.interface';
import { Roles } from '../../../common/auth/roles.decorator';
import { CreateReconciliationDto } from './dto/create-reconciliation.dto';
import { ListReconciliationsQueryDto } from './dto/list-reconciliations.query.dto';
import { ResolveDiscrepancyDto } from './dto/resolve-discrepancy.dto';
import { RunReconciliationDto } from './dto/run-reconciliation.dto';
import { ReconciliationsService } from './reconciliations.service';

@Controller('finance/reconciliations')
@Roles('FINANCE', 'ADMIN')
export class ReconciliationsController {
  constructor(private readonly service: ReconciliationsService) {}

  @Get()
  async list(@Query() query: ListReconciliationsQueryDto) {
    const { page, pageSize, ...filter } = query;
    const { rows, total } = await this.service.list(filter, { page, pageSize });
    return { data: rows, meta: { total, page: page ?? 1, pageSize: pageSize ?? 20 } };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateReconciliationDto, @CurrentActor() actor: AuthenticatedUser) {
    const data = await this.service.create(dto, actor);
    return { data };
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    const data = await this.service.getById(id);
    return { data };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    await this.service.delete(id);
  }

  @Post(':id/run')
  @HttpCode(HttpStatus.OK)
  async run(@Param('id') id: string, @Body() dto: RunReconciliationDto) {
    const data = await this.service.run(id, dto.settlementRows);
    return { data };
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  async resolve(
    @Param('id') id: string,
    @Body() dto: ResolveDiscrepancyDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    const data = await this.service.resolve(id, dto, actor);
    return { data };
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  async close(@Param('id') id: string, @CurrentActor() actor: AuthenticatedUser) {
    const data = await this.service.close(id, actor);
    return { data };
  }
}
