import { Injectable } from '@nestjs/common';
import { TransactionHistoryQueryDto } from './dto/transaction-history-query.dto';
import { LibraryOverviewService } from './library-overview.service';
import { LibraryAuditLogRepository } from './repositories/library-audit-log.repository';

// Purely a read/aggregation layer -- every number here comes from the same
// repositories/services Books/Circulation/Reservations/Fines/Members/
// LostDamaged already expose. The only genuinely new query is transaction
// history (a paginated view over the existing audit_event feed); every other
// report is served by the frontend calling an existing endpoint directly
// (see src/app/(dashboard)/library/reports/page.tsx), so there's no second
// inventory/circulation/overdue/reservation/fine query living in parallel here.
@Injectable()
export class ReportsService {
  constructor(
    private readonly overviewService: LibraryOverviewService,
    private readonly auditLogRepo: LibraryAuditLogRepository,
  ) {}

  /** Same copy-status breakdown the Dashboard already computes -- not
   * recomputed differently for Reports. */
  inventory() {
    return this.overviewService.get();
  }

  transactionHistory(query: TransactionHistoryQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    return this.auditLogRepo
      .findMany({
        startDate: query.startDate,
        endDate: query.endDate,
        limit,
        offset: (page - 1) * limit,
      })
      .then(({ rows, total }) => ({
        data: rows,
        meta: { page, limit, total },
      }));
  }
}
