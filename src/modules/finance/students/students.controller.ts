// Student Workspace's backing endpoints — the hub every other Finance screen (Fee
// Payments, Demand, Concessions, Education Loan DD) links into for one student at a
// time. See students.service.ts for why this exists in Finance rather than a
// dedicated People module (none exists yet in this codebase).

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentActor } from '../../../common/auth/current-actor.decorator';
import { AuthenticatedUser } from '../../../common/auth/authenticated-user.interface';
import { Roles } from '../../../common/auth/roles.decorator';
import { ListStudentsQueryDto } from './dto/list-students.query.dto';
import { ReceivePaymentDto } from './dto/receive-payment.dto';
import type { DueStatus } from './repositories/student-lookup.repository';
import { StudentsService } from './students.service';

@Controller('finance/students')
@Roles('FINANCE', 'ADMIN')
export class StudentsController {
  constructor(private readonly service: StudentsService) {}

  @Get()
  async list(@Query() query: ListStudentsQueryDto) {
    const { page, pageSize, ...filter } = query;
    const { rows, total } = await this.service.list(
      { ...filter, dueStatus: filter.dueStatus as DueStatus | undefined },
      { page, pageSize },
    );
    return {
      data: rows,
      meta: { total, page: page ?? 1, pageSize: pageSize ?? 20 },
    };
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    const data = await this.service.getById(id);
    return { data };
  }

  @Get(':id/payments')
  async listPayments(@Param('id') id: string) {
    const data = await this.service.listPayments(id);
    return { data };
  }

  @Get(':id/education-loan-dds')
  async listEducationLoanDDs(@Param('id') id: string) {
    const data = await this.service.listEducationLoanDDs(id);
    return { data };
  }

  @Post(':id/receive-payment')
  @HttpCode(HttpStatus.CREATED)
  async receivePayment(
    @Param('id') id: string,
    @Body() dto: ReceivePaymentDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    const data = await this.service.receivePayment(id, dto, actor);
    return { data };
  }
}
