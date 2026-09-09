import { Module } from '@nestjs/common';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { PeopleModule } from '../people/people.module';
import { MessagingController } from './messaging.controller';
import { MessagingService } from './messaging.service';
import { ClassAdvisorRepository } from './repositories/class-advisor.repository';
import { ConversationParticipantRepository } from './repositories/conversation-participant.repository';
import { ConversationRepository } from './repositories/conversation.repository';
import { GuardianLinkRepository } from './repositories/guardian-link.repository';
import { MessageTranslationRepository } from './repositories/message-translation.repository';
import { MessageRepository } from './repositories/message.repository';
import { PersonRepository } from './repositories/person.repository';
import { PrincipalRepository } from './repositories/principal.repository';
import { StaffRepository } from './repositories/staff.repository';
import { SubjectOfferingRepository } from './repositories/subject-offering.repository';
import { GoogleTranslateProvider } from './translation/google-translate.provider';
import { TRANSLATION_PROVIDER } from './translation/translation-provider.interface';
import { TranslationService } from './translation/translation.service';

@Module({
  // PeopleModule exported StaffService/StudentsService already back the Events
  // module's "monitoring teacher" picker (see StaffRepository's own doc comment)
  // -- the Principal faculty/student search endpoints reuse those same services,
  // not a second copy of their search queries.
  imports: [PeopleModule],
  controllers: [MessagingController],
  providers: [
    MessagingService,
    GuardianLinkRepository,
    StaffRepository,
    SubjectOfferingRepository,
    ClassAdvisorRepository,
    ConversationRepository,
    ConversationParticipantRepository,
    MessageRepository,
    MessageTranslationRepository,
    PersonRepository,
    PrincipalRepository,
    TranslationService,
    // Bound to the interface token so TranslationService can depend on
    // TranslationProvider without knowing which concrete vendor is behind it —
    // swapping providers later means changing only this one line.
    { provide: TRANSLATION_PROVIDER, useClass: GoogleTranslateProvider },
    UnitOfWork,
  ],
})
export class MessagingModule {}
