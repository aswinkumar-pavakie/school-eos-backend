import { Controller, Get } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator';
import { DashboardService } from './dashboard.service';

@Roles('ADMIN')
@Controller('admin/dashboard-summary')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  async get() {
    return { data: await this.dashboardService.getSummary() };
  }
}
