import { Controller, Get } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator';
import { ReportsService } from './reports.service';

@Roles('ADMIN')
@Controller('admin/reports-summary')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get()
  async get() {
    return { data: await this.reportsService.getSummary() };
  }
}
