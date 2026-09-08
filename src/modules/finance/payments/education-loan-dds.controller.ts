// Global "Education Loan DD" nav page — every DD-mode payment across every student.
// Not part of the 2.1-2.9 breakdown; added after the reference-structure request
// showed it as its own top-level section, distinct from a single student's own DD tab
// (students/:id/education-loan-dds).

import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../../common/auth/roles.decorator';
import { ListEducationLoanDDsQueryDto } from './dto/list-education-loan-dds.query.dto';
import { PaymentsService } from './payments.service';

@Controller('finance/education-loan-dds')
@Roles('FINANCE', 'ADMIN')
export class EducationLoanDDsController {
  constructor(private readonly service: PaymentsService) {}

  @Get()
  async list(@Query() query: ListEducationLoanDDsQueryDto) {
    const { page, pageSize, ...filter } = query;
    const { rows, total } = await this.service.listAllEducationLoanDDs(filter, {
      page,
      pageSize,
    });
    return {
      data: rows,
      meta: { total, page: page ?? 1, pageSize: pageSize ?? 20 },
    };
  }
}
