import { Module } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { AcademicModule } from '../academic/academic.module';
import { FinanceModule } from '../finance/finance.module';
import { PeopleModule } from '../people/people.module';
import { PermissionLetterDataService } from './permission-letter-data.service';
import { StudentEventParticipantRepository } from './repositories/student-event-participant.repository';
import { StudentEventRepository } from './repositories/student-event.repository';
import { StudentEventsController } from './student-events.controller';
import { StudentEventsService } from './student-events.service';

@Module({
  // FinanceModule: reuses SchoolProfileRepository for the permission letter's
  // school header (same source the Fees receipt already uses). PeopleModule:
  // reuses StudentRepository/StudentsService (student search) and
  // StaffRepository/StaffService (monitoring-teacher search) as-is.
  // AcademicModule: reuses GradeRepository/SectionRepository for the student
  // search's real class/section filter options.
  imports: [FinanceModule, PeopleModule, AcademicModule],
  controllers: [StudentEventsController],
  providers: [
    AuditService,
    StudentEventRepository,
    StudentEventParticipantRepository,
    PermissionLetterDataService,
    StudentEventsService,
  ],
  // Exported so ParentModule can reuse the exact same repositories/letter
  // service for its own parent-facing permission-request endpoints, rather than
  // a second, possibly-drifting implementation (mirrors MediaModule reusing
  // FinanceModule's PurchaseRequestsService).
  exports: [StudentEventParticipantRepository, StudentEventRepository, PermissionLetterDataService],
})
export class StudentEventsModule {}
