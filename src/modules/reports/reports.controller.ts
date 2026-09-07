import { Controller, Get } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator';
import { ReportsService } from './reports.service';

// PRINCIPAL added (Phase 19) -- same read-only cross-cutting aggregation
// Admin already has; nothing to narrow, this controller is a single GET.
// The route path itself still says "admin" (a naming artifact from before
// any other role read it) but that's cosmetic -- @Roles is what actually
// enforces authorization here, and it's a plain array any future role
// (Vice Principal, etc.) can be added to later with no rewrite.
@Roles('ADMIN', 'PRINCIPAL')
@Controller('admin/reports-summary')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get()
  async get() {
    return { data: await this.reportsService.getSummary() };
  }
}
