import { Controller, Get } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator';
import { PrincipalDashboardService } from './principal-dashboard.service';

// Broadened to VICE_PRINCIPAL (Vice Principal Phase 3 dashboard) -- this
// summary is genuinely generic leadership data (active student/staff counts,
// current academic year), not Principal-specific business logic, and the
// service itself already documents why it deliberately excludes every
// Admin-operational field. Read-only, single GET, no write endpoint exists
// on this controller to accidentally widen.
@Roles('PRINCIPAL', 'VICE_PRINCIPAL')
@Controller('principal/dashboard-summary')
export class PrincipalDashboardController {
  constructor(
    private readonly principalDashboardService: PrincipalDashboardService,
  ) {}

  @Get()
  async get() {
    return { data: await this.principalDashboardService.getSummary() };
  }
}
