// Library operations -- catalog, copies, members, circulation, reservations,
// fines, config. LIBRARY is the operational owner; ADMIN gets read-only
// oversight on most endpoints (see each controller's @Roles()); FINANCE reads
// fines read-only and owns actual fine collection via FinanceModule's
// MiscReceivablesService (imported below), never a second ledger in here.

import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { AuditController } from './audit.controller';
import { LibraryAuditService } from './library-audit.service';
import { BookCopiesListController, BookCopiesActionsController } from './book-copies.controller';
import { BookCopiesService } from './book-copies.service';
import { BooksController } from './books.controller';
import { BooksService } from './books.service';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { CirculationController } from './circulation.controller';
import { CirculationService } from './circulation.service';
import { FinesController } from './fines.controller';
import { FinesService } from './fines.service';
import { LibraryConfigController } from './library-config.controller';
import { LibraryConfigService } from './library-config.service';
import { LibraryFineAssessmentService } from './library-fine-assessment.service';
import { LibraryOverviewController } from './library-overview.controller';
import { LibraryOverviewService } from './library-overview.service';
import { LostDamagedController } from './lost-damaged.controller';
import { LostDamagedService } from './lost-damaged.service';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';
import { LibraryAuditLogRepository } from './repositories/library-audit-log.repository';
import { LibraryBookCopyRepository } from './repositories/library-book-copy.repository';
import { LibraryBookRepository } from './repositories/library-book.repository';
import { LibraryCategoryRepository } from './repositories/library-category.repository';
import { LibraryConfigRepository } from './repositories/library-config.repository';
import { LibraryFineRepository } from './repositories/library-fine.repository';
import { LibraryIssueRepository } from './repositories/library-issue.repository';
import { LibraryGradeLookupRepository } from './repositories/library-grade-lookup.repository';
import { LibraryLostDamagedReportRepository } from './repositories/library-lost-damaged-report.repository';
import { LibraryMemberRepository } from './repositories/library-member.repository';
import { LibraryReservationRepository } from './repositories/library-reservation.repository';

// LibraryOverviewService is exported for ReportsModule (Admin Reports & Analytics'
// Library section reuses this SAME service/query, not a parallel one).
@Module({
  imports: [FinanceModule],
  controllers: [
    BooksController,
    BookCopiesListController,
    BookCopiesActionsController,
    CategoriesController,
    MembersController,
    CirculationController,
    ReservationsController,
    FinesController,
    LibraryConfigController,
    LibraryOverviewController,
    LostDamagedController,
    ReportsController,
    AuditController,
  ],
  providers: [
    BooksService,
    BookCopiesService,
    CategoriesService,
    MembersService,
    CirculationService,
    ReservationsService,
    FinesService,
    LibraryConfigService,
    LibraryOverviewService,
    LostDamagedService,
    ReportsService,
    LibraryAuditService,
    LibraryFineAssessmentService,
    LibraryBookRepository,
    LibraryBookCopyRepository,
    LibraryCategoryRepository,
    LibraryMemberRepository,
    LibraryGradeLookupRepository,
    LibraryIssueRepository,
    LibraryReservationRepository,
    LibraryFineRepository,
    LibraryConfigRepository,
    LibraryLostDamagedReportRepository,
    LibraryAuditLogRepository,
  ],
  exports: [LibraryOverviewService],
})
export class LibraryModule {}
