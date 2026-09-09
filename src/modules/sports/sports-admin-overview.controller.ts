// Admin's read-only Sports oversight page (web). Registered before
// SportsController in sports.module.ts -- same route-order requirement its
// own header comment documents (a literal 2-segment path under /sports must
// come before SportsController's GET /sports/:id, or "overview" gets
// swallowed as an :id lookup).

import { Controller, Get } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator';
import { SportsAdminOverviewService } from './sports-admin-overview.service';

@Roles('ADMIN')
@Controller('sports/overview')
export class SportsAdminOverviewController {
  constructor(private readonly service: SportsAdminOverviewService) {}

  @Get()
  async get() {
    return { data: await this.service.getOverview() };
  }
}
