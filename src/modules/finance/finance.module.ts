// Finance Setup (Admin's scope, per workflow.md): fee heads, fee structures + their
// instalment lines -- now READ-ONLY here (list/get only). Write operations
// (create/edit fee heads & structures, publish/supersede, add/edit/remove lines)
// are owned by the separate Finance/Accounts login being built independently;
// this Admin view only needs to read them. Revisit once that module is in place.
// Wallet freeze/unfreeze is a genuine Admin safety control (lost ID card, etc.),
// not deferred like the rest of Finance -- it stays a real write path here.
// All tables already existed live in the DB -- pure application code.

import { Module } from '@nestjs/common';
import { FeeDemandsController } from './fee-demands.controller';
import { FeeDemandsService } from './fee-demands.service';
import { FeeHeadsController } from './fee-heads.controller';
import { FeeHeadsService } from './fee-heads.service';
import { FeeOverviewController } from './fee-overview.controller';
import { FeeOverviewService } from './fee-overview.service';
import { FeeStructuresController } from './fee-structures.controller';
import { FeeStructuresService } from './fee-structures.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { FeeDemandRepository } from './repositories/fee-demand.repository';
import { FeeHeadRepository } from './repositories/fee-head.repository';
import { FeeOverviewRepository } from './repositories/fee-overview.repository';
import { FeeStructureLineRepository } from './repositories/fee-structure-line.repository';
import { FeeStructureRepository } from './repositories/fee-structure.repository';
import { PaymentRepository } from './repositories/payment.repository';
import { StudentFeesRepository } from './repositories/student-fees.repository';
import { StudentWalletRepository } from './repositories/student-wallet.repository';
import { StudentFeesService } from './student-fees.service';
import { StudentWalletService } from './student-wallet.service';

@Module({
  // FeeOverview/FeeDemands/Payments are all Admin -> Finance visibility only
  // (sections 1/3/4 of that spec) -- read-only, same as FeeHeads/FeeStructures
  // above. No controller here ever exposes a POST/PATCH/DELETE; collection,
  // refunds, adjustments and reconciliation stay Finance-role-only, to be wired
  // up when that dedicated login is built.
  controllers: [
    FeeHeadsController,
    FeeStructuresController,
    FeeOverviewController,
    FeeDemandsController,
    PaymentsController,
  ],
  providers: [
    FeeHeadsService,
    FeeStructuresService,
    FeeOverviewService,
    FeeDemandsService,
    PaymentsService,
    FeeHeadRepository,
    FeeStructureRepository,
    FeeStructureLineRepository,
    FeeOverviewRepository,
    FeeDemandRepository,
    PaymentRepository,
    StudentFeesRepository,
    StudentFeesService,
    StudentWalletRepository,
    StudentWalletService,
  ],
  exports: [StudentFeesService, StudentWalletService],
})
export class FinanceModule {}
