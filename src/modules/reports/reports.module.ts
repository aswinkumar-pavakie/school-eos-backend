// Admin's Reports & Analytics -- read-only aggregation, top-level module
// (mirrors DashboardModule's own placement, not nested under admin/). Imports
// the three modules whose existing service/repository this reuses (Fees,
// Library, Requests & Approvals); every other domain is this module's own
// count queries in reports.service.ts, same convention as dashboard.service.ts.

import { Module } from '@nestjs/common';
import { AdminFinanceModule } from '../finance/admin-finance.module';
import { LibraryModule } from '../library/library.module';
import { RequestsApprovalsModule } from '../requests-approvals/requests-approvals.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [AdminFinanceModule, LibraryModule, RequestsApprovalsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
