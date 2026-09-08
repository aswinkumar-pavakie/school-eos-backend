import { Module } from '@nestjs/common';
import { GoogleCalendarService } from './google/google-calendar.service';
import { GoogleOAuthController } from './google/google-oauth.controller';
import { GoogleOAuthService } from './google/google-oauth.service';
import { OnlineClassesController } from './online-classes.controller';
import { OnlineClassesService } from './online-classes.service';
import { ParentOnlineClassesService } from './parent-online-classes.service';
import { GoogleAccountConnectionRepository } from './repositories/google-account-connection.repository';
import { GuardianLinkRepository } from './repositories/guardian-link.repository';
import { OnlineClassRescheduleRepository } from './repositories/online-class-reschedule.repository';
import { OnlineClassRepository } from './repositories/online-class.repository';
import { SchoolRepository } from './repositories/school.repository';
import { StaffRepository } from './repositories/staff.repository';
import { SubjectOfferingRepository } from './repositories/subject-offering.repository';

@Module({
  controllers: [OnlineClassesController, GoogleOAuthController],
  providers: [
    OnlineClassesService,
    ParentOnlineClassesService,
    GoogleOAuthService,
    GoogleCalendarService,
    OnlineClassRepository,
    OnlineClassRescheduleRepository,
    StaffRepository,
    SubjectOfferingRepository,
    GoogleAccountConnectionRepository,
    SchoolRepository,
    GuardianLinkRepository,
  ],
})
export class OnlineClassesModule {}
