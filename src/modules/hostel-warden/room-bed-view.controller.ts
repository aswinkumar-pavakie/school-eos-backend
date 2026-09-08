import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { RoomBedViewService } from './room-bed-view.service';

// Feature 8 -- read only. No POST/PATCH/DELETE route exists on this controller, and
// none ever should: hostel/block/room/bed creation, editing and student
// allocation/transfer stay ADMIN-only (src/modules/hostel).
@Roles('HOSTEL_WARDEN')
@Controller('hostel')
export class RoomBedViewController {
  constructor(private readonly service: RoomBedViewService) {}

  @Get('room-allocations')
  async listAllocations(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.listAllocations(actor.personId) };
  }

  // Must stay registered before ':id'-shaped routes -- there are none on this
  // controller today, but keeping the static route first is this repo's own
  // convention (see hostel-allocations.controller.ts).
  @Get('blocks')
  async listHostelStructure(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.service.listHostelStructure(actor.personId) };
  }

  @Get('students/:studentId/room')
  async getStudentRoom(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.service.getStudentRoom(studentId, actor.personId),
    };
  }

  @Get('students/:studentId/guardians')
  async getStudentGuardians(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.service.getStudentGuardians(studentId, actor.personId),
    };
  }
}
