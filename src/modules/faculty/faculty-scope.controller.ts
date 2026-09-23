import { Controller, Get } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ClassTeacherLoginService } from '../admin/class-teacher-login.service';
import { FacultyScopeRepository } from './repositories/faculty-scope.repository';

// "Which classes am I scoped to" -- the one shared answer every class-switcher
// in the Faculty app reads from (see FacultyScopeRepository's own header note
// for why advisor-sections and teaching-offerings are two genuinely different
// scopes).
@Roles('FACULTY', 'CLASS_ADVISOR')
@Controller('faculty/scope')
export class FacultyScopeController {
  constructor(
    private readonly scopeRepo: FacultyScopeRepository,
    private readonly classTeacherLoginService: ClassTeacherLoginService,
  ) {}

  @Get('advisor-sections')
  async advisorSections(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.scopeRepo.getAdvisorSections(actor.personId) };
  }

  @Get('teaching-offerings')
  async teachingOfferings(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.scopeRepo.getTeachingOfferings(actor.personId) };
  }

  // Tells the mobile app whether this faculty member currently has a
  // separate Class Teacher login to switch into -- and if so, which
  // identifier to prefill on first switch. Never returns the password;
  // that's communicated to the faculty member by Admin out of band, same as
  // the Academic Coordinator login today.
  @Get('class-teacher-link')
  async classTeacherLink(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.classTeacherLoginService.getFacultyClassTeacherLink(actor.personId) };
  }

  // Drives the mobile bottom nav's conditional 5th tab -- see
  // FacultyScopeRepository.getCommutePrefs's own header note.
  @Get('commute')
  async commute(@CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.scopeRepo.getCommutePrefs(actor.personId) };
  }
}
