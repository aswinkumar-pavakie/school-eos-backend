import { Controller, Get } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator';
import { PrincipalDashboardService } from './principal-dashboard.service';

@Roles('PRINCIPAL')
@Controller('principal/dashboard-summary')
export class PrincipalDashboardController {
  constructor(private readonly principalDashboardService: PrincipalDashboardService) {}

  @Get()
  async get() {
    return { data: await this.principalDashboardService.getSummary() };
  }
}
