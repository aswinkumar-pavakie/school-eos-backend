import { Controller, Get } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ReportsService } from './reports.service';

// PRINCIPAL added (Phase 19) -- same read-only cross-cutting aggregation
// Admin already has; nothing to narrow, this controller is a single GET.
// The route path itself still says "admin" (a naming artifact from before
// any other role read it) but that's cosmetic -- @Roles is what actually
// enforces authorization here, and it's a plain array any future role
// (Vice Principal, etc.) can be added to later with no rewrite.
//
// VICE_PRINCIPAL added (Vice Principal mobile Reports module) -- deliberately
// NOT the same unredacted parity Principal gets. Every OTHER section here is
// already independently authorized for VP by an earlier phase's own grant
// (enrollment/staff -> Faculty & Students, attendance -> Attendance, fees ->
// Finance's fee-overview, transport/hostel/inventory -> their own VP modules,
// library -> Library's overview, which this literally reuses the same
// service call for) -- but requestsApprovals has NO VP precedent anywhere
// yet (Requests & Approvals is still unbuilt for VP, explicitly out of scope
// of every phase including this one). Rather than fork this into a second
// endpoint/service (new architecture this phase's own scope forbids), the
// one field with no authorization is redacted in the response for any actor
// who isn't ADMIN/PRINCIPAL -- same "real data, granular enforcement" outcome
// with the smallest possible change: reuses getSummary() completely
// unchanged, no duplicated query, no new route.
@Roles('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL')
@Controller('admin/reports-summary')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get()
  async get(@CurrentActor() actor: AuthenticatedUser) {
    const summary = await this.reportsService.getSummary();
    const isLeadership = actor.roles.includes('ADMIN') || actor.roles.includes('PRINCIPAL');
    if (isLeadership) return { data: summary };
    const { requestsApprovals: _requestsApprovals, ...vpSummary } = summary;
    return { data: vpSummary };
  }
}
