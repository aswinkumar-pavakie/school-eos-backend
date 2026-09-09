import { Module } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { AnnouncementsModule } from '../announcements/announcements.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { FinanceModule } from '../finance/finance.module';
import { CalendarRepository } from '../faculty/repositories/calendar.repository';
import { HostelWardenModule } from '../hostel-warden/hostel-warden.module';
import { LibraryModule } from '../library/library.module';
import { LibraryFineRepository } from '../library/repositories/library-fine.repository';
import { StudentEventsModule } from '../student-events/student-events.module';
import { ParentAcademicController } from './parent-academic.controller';
import { ParentAcademicService } from './parent-academic.service';
import { ParentBusController } from './parent-bus.controller';
import { ParentBusService } from './parent-bus.service';
import { ParentDocumentsController } from './parent-documents.controller';
import { ParentDocumentsService } from './parent-documents.service';
import { ParentFeedbackController } from './parent-feedback.controller';
import { ParentFeedbackService } from './parent-feedback.service';
import { ParentFeesController } from './parent-fees.controller';
import { ParentFeesService } from './parent-fees.service';
import { ParentHealthController } from './parent-health.controller';
import { ParentHealthService } from './parent-health.service';
import { ParentHomeworkController } from './parent-homework.controller';
import { ParentHomeworkService } from './parent-homework.service';
import { ParentHostelRequestsController } from './parent-hostel-requests.controller';
import { ParentHostelRequestsService } from './parent-hostel-requests.service';
import { ParentLibraryController } from './parent-library.controller';
import { ParentLibraryService } from './parent-library.service';
import { ParentPermissionsController } from './parent-permissions.controller';
import { ParentPermissionsService } from './parent-permissions.service';
import { GatewayOrderRepository } from './repositories/gateway-order.repository';
import { GuardianLinkRepository } from './repositories/guardian-link.repository';
import { ParentAcademicRepository } from './repositories/parent-academic.repository';
import { ParentBusRepository } from './repositories/parent-bus.repository';
import { ParentDocumentRequestRepository } from './repositories/parent-document-request.repository';
import { ParentFeeRepository } from './repositories/parent-fee.repository';
import { ParentFeedbackRepository } from './repositories/parent-feedback.repository';
import { ParentHealthRepository } from './repositories/parent-health.repository';
import { ParentHomeworkRepository } from './repositories/parent-homework.repository';
import { RazorpayWebhookController } from './razorpay/razorpay-webhook.controller';
import { RazorpayWebhookGuard } from './razorpay/razorpay-webhook.guard';
import { RazorpayService } from './razorpay/razorpay.service';

@Module({
  // FinanceModule: reuses PaymentsService/PaymentRepository/FeeDemandRepository/
  // SchoolProfileRepository as-is (see its own exports) rather than duplicating
  // real transactional payment logic a second time here. StudentEventsModule:
  // reuses its StudentEventRepository/StudentEventParticipantRepository/
  // cross-module reuse pattern as the rest of this codebase. HostelWardenModule:
  // reuses OutingRequestRepository/StudentHostelRepository for the parent-initiated
  // Gate Pass / Emergency Exit requests below. ApprovalsModule: so this module can
  // call ApprovalsService.createRequest in-process, inside its own transaction.
  // AttendanceModule: reuses its own exported AttendanceRecordsService
  // (Attendance/Report-card summary) rather than a second copy of the
  // locked-session query logic. LibraryModule: reuses BooksService/
  // CategoriesService/CirculationService/LibraryMemberRepository as-is, same
  // reuse pattern faculty-library.controller.ts already uses.
  // CalendarRepository/LibraryFineRepository: neither FacultyModule nor
  // LibraryModule exports these, so (both being stateless, PostgresService-only
  // repositories) they're provided a second time here directly, same as any
  // other plain read repository.
  imports: [
    FinanceModule,
    StudentEventsModule,
    HostelWardenModule,
    ApprovalsModule,
    AttendanceModule,
    LibraryModule,
    AnnouncementsModule,
  ],
  controllers: [
    ParentFeesController,
    RazorpayWebhookController,
    ParentPermissionsController,
    ParentHostelRequestsController,
    ParentAcademicController,
    ParentHomeworkController,
    ParentLibraryController,
    ParentHealthController,
    ParentFeedbackController,
    ParentDocumentsController,
    ParentBusController,
  ],
  providers: [
    AuditService,
    GuardianLinkRepository,
    ParentFeeRepository,
    GatewayOrderRepository,
    RazorpayService,
    RazorpayWebhookGuard,
    ParentFeesService,
    ParentPermissionsService,
    ParentHostelRequestsService,
    CalendarRepository,
    ParentAcademicRepository,
    ParentAcademicService,
    ParentHomeworkRepository,
    ParentHomeworkService,
    LibraryFineRepository,
    ParentLibraryService,
    ParentHealthRepository,
    ParentHealthService,
    ParentFeedbackRepository,
    ParentFeedbackService,
    ParentDocumentRequestRepository,
    ParentDocumentsService,
    ParentBusRepository,
    ParentBusService,
  ],
  // GuardianLinkRepository: so HostelWardenPendingModule's parent-initiated Call
  // Request feature can reuse the same "real ACTIVE guardian_link" check, once its
  // backing table exists and it's wired into AppModule.
  exports: [GuardianLinkRepository],
})
export class ParentModule {}
