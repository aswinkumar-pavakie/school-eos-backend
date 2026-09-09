// Approve/reject for an above-petty-limit expense happen via the generic engine
// (POST /approvals/{approvalRequestId}/approve|reject — see ExpensesService.submit),
// not a Finance-specific endpoint here.

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentActor } from '../../../common/auth/current-actor.decorator';
import { AuthenticatedUser } from '../../../common/auth/authenticated-user.interface';
import { Roles } from '../../../common/auth/roles.decorator';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ListExpensesQueryDto } from './dto/list-expenses.query.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ExpensesService } from './expenses.service';

// Class-level @Roles is deliberately broadened to include PRINCIPAL for read-only
// oversight (Principal's own /principal/finance/expenses/[id] view, reached from
// an approval's "View underlying record") -- every write method below has its own
// narrower @Roles('FINANCE', 'ADMIN') that overrides the class-level one
// (RolesGuard uses Reflector.getAllAndOverride, so a method-level @Roles fully
// replaces, never merges with, the class-level one), so Principal never gains
// create/update/delete/submit/pay access even by calling the API directly.
@Controller('finance/expenses')
@Roles('FINANCE', 'ADMIN', 'PRINCIPAL')
export class ExpensesController {
  constructor(private readonly service: ExpensesService) {}

  @Get()
  async list(@Query() query: ListExpensesQueryDto) {
    const { page, pageSize, ...filter } = query;
    const { rows, total } = await this.service.list(filter, { page, pageSize });
    return {
      data: rows,
      meta: { total, page: page ?? 1, pageSize: pageSize ?? 20 },
    };
  }

  @Post()
  @Roles('FINANCE', 'ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateExpenseDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
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
  async update(@Param('id') id: string, @Body() dto: UpdateExpenseDto) {
    const data = await this.service.update(id, dto);
    return { data };
  }

  @Delete(':id')
  @Roles('FINANCE', 'ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('id') id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    await this.service.delete(id, actor);
  }

  @Post(':id/submit')
  @Roles('FINANCE', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  async submit(
    @Param('id') id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    const data = await this.service.submit(id, actor);
    return { data };
  }

  @Post(':id/pay')
  @Roles('FINANCE', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  async pay(@Param('id') id: string, @CurrentActor() actor: AuthenticatedUser) {
    const data = await this.service.pay(id, actor);
    return { data };
  }
}
