import { Controller, Get, ParseUUIDPipe, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { FacultySubjectRecordsService } from './faculty-subject-records.service';

@Roles('FACULTY')
@Controller('faculty/subject-records')
export class FacultySubjectRecordsController {
  constructor(private readonly service: FacultySubjectRecordsService) {}

  @Get()
  async get(@Query('subjectOfferingId', ParseUUIDPipe) subjectOfferingId: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.getRecords(actor.personId, subjectOfferingId) };
  }
}
