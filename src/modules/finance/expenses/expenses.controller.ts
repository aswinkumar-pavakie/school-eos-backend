// Approve/reject for an above-petty-limit expense happen via the generic engine
// (POST /approvals/{approvalRequestId}/approve|reject — see ExpensesService.submit),
// not a Finance-specific endpoint here.

import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentActor } from '../../../common/auth/current-actor.decorator';
import { AuthenticatedUser } from '../../../common/auth/authenticated-user.interface';
import { Roles } from '../../../common/auth/roles.decorator';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ListExpensesQueryDto } from './dto/list-expenses.query.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ExpensesService } from './expenses.service';

@Controller('finance/expenses')
@Roles('FINANCE', 'ADMIN')
export class ExpensesController {
  constructor(private readonly service: ExpensesService) {}

  @Get()
  async list(@Query() query: ListExpensesQueryDto) {
    const { page, pageSize, ...filter } = query;
    const { rows, total } = await this.service.list(filter, { page, pageSize });
    return { data: rows, meta: { total, page: page ?? 1, pageSize: pageSize ?? 20 } };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateExpenseDto, @CurrentActor() actor: AuthenticatedUser) {
    const data = await this.service.create(dto, actor);
    return { data };
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    const data = await this.service.getById(id);
    return { data };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateExpenseDto) {
    const data = await this.service.update(id, dto);
    return { data };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @CurrentActor() actor: AuthenticatedUser) {
    await this.service.delete(id, actor);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  async submit(@Param('id') id: string, @CurrentActor() actor: AuthenticatedUser) {
    const data = await this.service.submit(id, actor);
    return { data };
  }

  @Post(':id/pay')
  @HttpCode(HttpStatus.OK)
  async pay(@Param('id') id: string, @CurrentActor() actor: AuthenticatedUser) {
    const data = await this.service.pay(id, actor);
    return { data };
  }
}
