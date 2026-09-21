import { Controller, Get } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { StaffBusRepository } from './repositories/staff-bus.repository';

// Widened to SPORTS_ADMIN -- their own mobile Home/Bus screen needs the exact
// same "am I personally a driver/attendant on any route" lookup Faculty's own
// My Bus screen already uses (same shared staff_bus_assignment concept, no
// new backend entity), matching the design's own single fixed-shuttle mock.
@Roles('FACULTY', 'SPORTS_ADMIN')
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
