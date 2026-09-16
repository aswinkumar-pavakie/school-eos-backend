// Admin's read-only Sports oversight page (web). Registered before
// SportsController in sports.module.ts -- same route-order requirement its
// own header comment documents (a literal 2-segment path under /sports must
// come before SportsController's GET /sports/:id, or "overview" gets
// swallowed as an :id lookup).
//
// PRINCIPAL added (2026-09) -- same read-only oversight scope every other
// admin-*-overview-shaped controller in this codebase already grants
// Principal (media/dashboard, library/overview, fee-overview, etc.); nothing
// to narrow, this controller is a single GET with no write path at all.
import { Controller, Get } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator';
import { SportsAdminOverviewService } from './sports-admin-overview.service';

@Roles('ADMIN', 'PRINCIPAL')
@Controller('sports/overview')
export class SportsAdminOverviewController {
  constructor(private readonly service: SportsAdminOverviewService) {}

  @Get()
  async get() {
    return { data: await this.service.getOverview() };
  }
}
