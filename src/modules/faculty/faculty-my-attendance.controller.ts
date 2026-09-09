import { Controller, Get, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { MyAttendanceQueryDto } from './dto/my-attendance-query.dto';
import { FacultyMyAttendanceService } from './faculty-my-attendance.service';

@Roles('FACULTY')
@Controller('faculty/my-attendance')
export class FacultyMyAttendanceController {
  constructor(private readonly service: FacultyMyAttendanceService) {}

  @Get()
  async get(
    @Query() query: MyAttendanceQueryDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.service.getSummary(actor.personId, query.month) };
  }
}
