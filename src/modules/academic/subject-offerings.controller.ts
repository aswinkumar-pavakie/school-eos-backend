import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { SubjectOfferingQueryDto } from './dto/subject-offering-query.dto';
import { UpdateSubjectOfferingTeacherDto } from './dto/update-subject-offering-teacher.dto';
import { SubjectOfferingsService } from './subject-offerings.service';

// Real teaching-assignment table (subject_offering) already existed, fully
// populated, with no API in front of it -- see query.md. Admin-only: which
// faculty teaches which subject/section is an Admin operational action, same
// as every other write in this module.
@Roles('ADMIN')
@Controller('subject-offerings')
export class SubjectOfferingsController {
  constructor(private readonly subjectOfferingsService: SubjectOfferingsService) {}

  @Get()
  async list(@Query() query: SubjectOfferingQueryDto) {
    return { data: await this.subjectOfferingsService.list(query) };
  }

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
