import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { FacultyStudentDetailService } from './faculty-student-detail.service';

@Roles('FACULTY')
@Controller('faculty/students')
export class FacultyStudentDetailController {
  constructor(private readonly service: FacultyStudentDetailService) {}

  @Get(':studentId')
  async getStudentDetail(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.service.getStudentDetail(actor.personId, studentId),
    };
  }
}
