import { Controller, Get } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator';
import { PrincipalDashboardService } from './principal-dashboard.service';

// Broadened to VICE_PRINCIPAL (Vice Principal Phase 3 dashboard) -- this
// summary is genuinely generic leadership data (active student/staff counts,
// current academic year), not Principal-specific business logic, and the
// service itself already documents why it deliberately excludes every
// Admin-operational field. Read-only, single GET, no write endpoint exists
// on this controller to accidentally widen. Broadened again to ADMIN -- the
// Admin dashboard's own reference design wants the same real
// parentLoginsIssued/staffMarkedToday fields this summary already computes,
// which Admin's own separate /admin/dashboard-summary endpoint doesn't have;
// reusing this one real service avoids a second, duplicate aggregation.
@Roles('PRINCIPAL', 'VICE_PRINCIPAL', 'ADMIN')
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
