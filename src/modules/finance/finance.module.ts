import { Module } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { OutboxService } from '../../common/outbox/outbox.service';
import { ApprovalsModule } from '../approvals/approvals.module';
import { ConcessionsController } from './concessions/concessions.controller';
import { ConcessionsService } from './concessions/concessions.service';
import { ConcessionRepository } from './concessions/repositories/concession.repository';
import { ExpensesController } from './expenses/expenses.controller';
import { ExpensesService } from './expenses/expenses.service';
import { ExpenseRepository } from './expenses/repositories/expense.repository';
import { FinanceApprovalHandlers } from './finance-approval-handlers.service';
import { FeeStructuresController } from './fee-structures/fee-structures.controller';
import { FeeStructuresService } from './fee-structures/fee-structures.service';
import { FeeStructureRepository } from './fee-structures/repositories/fee-structure.repository';
import {
  AcademicYearsController,
  DepartmentsController,
  ExpenseCategoriesController,
  FeeHeadsController,
  GradesController,
  MediumsController,
  SchoolProfileController,
} from './master-data/master-data.controller';
import { AcademicYearLookupRepository } from './master-data/repositories/academic-year-lookup.repository';
import { DepartmentLookupRepository } from './master-data/repositories/department-lookup.repository';
import { ExpenseCategoryRepository } from './master-data/repositories/expense-category.repository';
import { FeeHeadRepository } from './master-data/repositories/fee-head.repository';
import { GradeLookupRepository } from './master-data/repositories/grade-lookup.repository';
import { MediumLookupRepository } from './master-data/repositories/medium-lookup.repository';
import { SchoolProfileRepository } from './master-data/repositories/school-profile.repository';
import { ObligationImportsController } from './obligation-imports/obligation-imports.controller';
import { ObligationImportsService } from './obligation-imports/obligation-imports.service';
import { BulkImportJobRepository } from './obligation-imports/repositories/bulk-import-job.repository';
import { StudentFeeAssignmentLookupRepository } from './obligation-imports/repositories/student-fee-assignment-lookup.repository';
import { ObligationsController } from './obligations/obligations.controller';
import { ObligationsService } from './obligations/obligations.service';
import { FeeDemandRepository } from './obligations/repositories/fee-demand.repository';
import { EducationLoanDDsController } from './payments/education-loan-dds.controller';
import { PaymentWebhookController } from './payments/payment-webhook.controller';
import { PaymentWebhookGuard } from './payments/payment-webhook.guard';
import { PaymentsController } from './payments/payments.controller';
import { PaymentsService } from './payments/payments.service';
import { PaymentAllocationRepository } from './payments/repositories/payment-allocation.repository';
import { PaymentRepository } from './payments/repositories/payment.repository';
import { ReceiptRepository } from './payments/repositories/receipt.repository';
import { RefundRepository } from './payments/repositories/refund.repository';
import { ReceiptsController } from './payments/receipts.controller';
import { RefundsController } from './payments/refunds.controller';
import { PurchaseOrdersController, PurchaseRequestsController } from './purchase-requests/purchase-requests.controller';
import { PurchaseRequestsService } from './purchase-requests/purchase-requests.service';
import { PurchaseOrderRepository } from './purchase-requests/repositories/purchase-order.repository';
import { PurchaseRequestRepository } from './purchase-requests/repositories/purchase-request.repository';
import { ReconciliationsController } from './reconciliations/reconciliations.controller';
import { ReconciliationsService } from './reconciliations/reconciliations.service';
import { ReconciliationRepository } from './reconciliations/repositories/reconciliation.repository';
import { StudentsController } from './students/students.controller';
import { StudentsService } from './students/students.service';
import { StudentLookupRepository } from './students/repositories/student-lookup.repository';

@Module({
  imports: [ApprovalsModule],
  controllers: [
    FeeHeadsController,
    ExpenseCategoriesController,
    GradesController,
    DepartmentsController,
    AcademicYearsController,
    MediumsController,
    SchoolProfileController,
    ReceiptsController,
    StudentsController,
    FeeStructuresController,
    ObligationsController,
    ObligationImportsController,
    PaymentsController,
    EducationLoanDDsController,
    RefundsController,
    PaymentWebhookController,
    ConcessionsController,
    ExpensesController,
    ReconciliationsController,
    PurchaseRequestsController,
    PurchaseOrdersController,
  ],
  providers: [
    OutboxService,
    AuditService,
    FinanceApprovalHandlers,
    FeeHeadRepository,
    ExpenseCategoryRepository,
    GradeLookupRepository,
    DepartmentLookupRepository,
    AcademicYearLookupRepository,
    MediumLookupRepository,
    SchoolProfileRepository,
    FeeStructureRepository,
    FeeStructuresService,
    FeeDemandRepository,
    ObligationsService,
    BulkImportJobRepository,
    StudentFeeAssignmentLookupRepository,
    ObligationImportsService,
    PaymentRepository,
    PaymentAllocationRepository,
    ReceiptRepository,
    RefundRepository,
    PaymentsService,
    PaymentWebhookGuard,
    ConcessionRepository,
    ConcessionsService,
    ExpenseRepository,
    ExpensesService,
    ReconciliationRepository,
    ReconciliationsService,
    StudentLookupRepository,
    StudentsService,
    PurchaseRequestRepository,
    PurchaseOrderRepository,
    PurchaseRequestsService,
  ],
  // Reused as-is by ParentModule (the Parent app's real-time fee payment feature) —
  // rather than duplicating PaymentsService's transactional create/allocate/webhook
  // logic, or FeeDemandRepository's real fee_demand queries, a second time there.
  // PurchaseRequestsService/repositories are reused as-is by MediaModule's own
  // indent feature too (same purchase_request/purchase_order tables and the same
  // already-registered approval handler — only the approval_policy requestType and
  // who's allowed to call create() differ; see MediaIndentsController).
  exports: [
    PaymentsService,
    PaymentRepository,
    PaymentAllocationRepository,
    FeeDemandRepository,
    SchoolProfileRepository,
    PurchaseRequestsService,
    PurchaseRequestRepository,
    PurchaseOrderRepository,
  ],
})
export class FinanceModule {}
