import { Controller, Get } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { FacultyScopeRepository } from './repositories/faculty-scope.repository';

// "Which classes am I scoped to" -- the one shared answer every class-switcher
// in the Faculty app reads from (see FacultyScopeRepository's own header note
// for why advisor-sections and teaching-offerings are two genuinely different
// scopes).
@Roles('FACULTY')
@Controller('faculty/scope')
export class FacultyScopeController {
  constructor(private readonly scopeRepo: FacultyScopeRepository) {}

  @Get('advisor-sections')
  async advisorSections(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.scopeRepo.getAdvisorSections(actor.personId) };
  }

  @Get('teaching-offerings')
  async teachingOfferings(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.scopeRepo.getTeachingOfferings(actor.personId) };
  }
}
