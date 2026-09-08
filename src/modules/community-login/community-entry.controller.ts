import { Controller, Get } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';

// Phase 1 (Community Login) only -- the minimum protected endpoint needed to
// prove RolesGuard recognizes COMMUNITY end to end, same minimal shape as
// principal-dashboard.controller.ts. Deliberately returns nothing but the
// already-authenticated actor's own identity (no DB query, no business data)
// -- there is no Community module to serve data from yet; that's a later
// phase. Do not add fields here beyond identity confirmation.
@Roles('COMMUNITY')
@Controller('community/entry')
export class CommunityEntryController {
  @Get()
  get(@CurrentActor() actor: AuthenticatedUser) {
    return { data: { personId: actor.personId, roles: actor.roles } };
  }
}
