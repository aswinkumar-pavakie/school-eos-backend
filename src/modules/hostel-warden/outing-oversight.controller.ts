import { Controller, Get } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator';
import { OutingRequestsSharedService } from './outing-requests-shared.service';

// School-wide, not warden-scoped -- backs the Principal/Vice Principal/Admin web
// console's real Hostel "Out of the hostel now" KPI and "Students out of the
// hostel" list (design-reframe addition), covering both Gate Pass and
// Emergency Exit outing_request rows as one "out of hostel" concept, same as
// GatePassRequestsController/EmergencyExitRequestsController's own list()
// routes but summed across every hostel instead of one Warden's assignment.
// A distinct controller (rather than an @Get('oversight') on either of those
// two) since this one endpoint intentionally spans both request types.
@Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL')
@Controller('hostel/outings')
export class OutingOversightController {
  constructor(private readonly service: OutingRequestsSharedService) {}

  @Get('oversight')
  async oversight() {
    return { data: await this.service.listActiveOversight() };
  }

  // Registered before no dynamic sibling route exists under this controller,
  // so this static path is never ambiguous.
  @Get('recent-decisions')
  async recentDecisions() {
    return { data: await this.service.listRecentDecisions(8) };
  }
}
