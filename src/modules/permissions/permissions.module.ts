// Registered in AppModule as of 2026-09-06, once permission_activity and
// permission_request were confirmed to exist (see this module's README
// "Database design" section for the exact DDL that was run).

import { Module } from '@nestjs/common';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { PermissionActivitiesController } from './permission-activities.controller';
import { PermissionActivityService } from './permission-activity.service';
import { PermissionRequestsController } from './permission-requests.controller';
import { PermissionRequestService } from './permission-request.service';
import { ClassAdvisorRepository } from './repositories/class-advisor.repository';
import { GuardianLinkRepository } from './repositories/guardian-link.repository';
import { PermissionActivityRepository } from './repositories/permission-activity.repository';
import { PermissionRequestRepository } from './repositories/permission-request.repository';
import { PersonRepository } from './repositories/person.repository';
import { SectionRepository } from './repositories/section.repository';
import { StaffRepository } from './repositories/staff.repository';
import { StudentEnrolmentRepository } from './repositories/student-enrolment.repository';
import { SubjectOfferingRepository } from './repositories/subject-offering.repository';

@Module({
  controllers: [PermissionActivitiesController, PermissionRequestsController],
  providers: [
    PermissionActivityService,
    PermissionRequestService,
    GuardianLinkRepository,
    StaffRepository,
    SubjectOfferingRepository,
    ClassAdvisorRepository,
    StudentEnrolmentRepository,
    SectionRepository,
    PersonRepository,
    PermissionActivityRepository,
    PermissionRequestRepository,
    UnitOfWork,
  ],
})
export class PermissionsModule {}
