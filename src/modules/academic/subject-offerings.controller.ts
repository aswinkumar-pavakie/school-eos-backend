import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { SubjectOfferingQueryDto } from './dto/subject-offering-query.dto';
import { UpdateSubjectOfferingTeacherDto } from './dto/update-subject-offering-teacher.dto';
import { SubjectOfferingsService } from './subject-offerings.service';

// Real teaching-assignment table (subject_offering) already existed, fully
// populated, with no API in front of it -- see query.md. Assigning a teacher
// stays Admin-only (an operational action), but reading who teaches what is
// real, read-only oversight, same as every other Principal GET override in
// this codebase (exams/attendance-sessions) -- backs the Principal web
// console's "Subjects & mapping" page (design-reframe addition).
@Roles('ADMIN')
@Controller('subject-offerings')
export class SubjectOfferingsController {
  constructor(private readonly subjectOfferingsService: SubjectOfferingsService) {}

  @Roles('ADMIN', 'PRINCIPAL')
  @Get()
  async list(@Query() query: SubjectOfferingQueryDto) {
    return { data: await this.subjectOfferingsService.list(query) };
  }

  // School-wide mapping for the current year -- a distinct route (not GET /
  // with sectionId omitted) since list()'s DTO expects a section. Backs the
  // Principal web console's "Subjects & mapping" page.
  @Roles('ADMIN', 'PRINCIPAL')
  @Get('all')
  async listAll() {
    return { data: await this.subjectOfferingsService.listAllCurrentYear() };
  }

  @Roles('ADMIN', 'PRINCIPAL')
  @Get('by-teacher/:staffId')
  async listForTeacher(@Param('staffId') staffId: string) {
    return { data: await this.subjectOfferingsService.listForTeacher(staffId) };
  }

  @Patch(':id/teacher')
  async assignTeacher(
    @Param('id') id: string,
    @Body() dto: UpdateSubjectOfferingTeacherDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.subjectOfferingsService.assignTeacher(id, dto, actor.personId) };
  }
}
