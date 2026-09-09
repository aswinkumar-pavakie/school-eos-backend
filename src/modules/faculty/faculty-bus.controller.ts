import { Controller, Get } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { StaffBusRepository } from './repositories/staff-bus.repository';

@Roles('FACULTY')
@Controller('faculty/bus')
export class FacultyBusController {
  constructor(private readonly busRepo: StaffBusRepository) {}

  @Get()
  async get(@CurrentActor() actor: AuthenticatedUser) {
    const assignment = await this.busRepo.findAssignmentForPerson(
      actor.personId,
    );
    return { data: assignment };
  }
}
