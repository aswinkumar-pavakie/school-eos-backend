// Sports Setup (Admin's scope, per workflow.md): sport/sport_category catalog,
// equipment master records, and coach registration. Sports Operations (teams,
// rosters, profiles, training, tournaments/fixtures/results, achievements,
// equipment issue/return + restock, OD requests) is Faculty + Sports Faculty
// assignment territory — now built here too, alongside Setup, the same way
// online-classes keeps its Faculty and Parent services in one module.

import { Module } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { ApprovalsModule } from '../approvals/approvals.module';
import { FinanceModule } from '../finance/finance.module';
import { StudentEventsModule } from '../student-events/student-events.module';
import { TimetableModule } from '../timetable/timetable.module';
import { CoachesController } from './coaches.controller';
import { CoachesService } from './coaches.service';
import { EquipmentController } from './equipment.controller';
import { EquipmentService } from './equipment.service';
import { AchievementRepository } from './repositories/achievement.repository';
import { CoachRepository } from './repositories/coach.repository';
import { EquipmentIssueRepository } from './repositories/equipment-issue.repository';
import { EquipmentRepository } from './repositories/equipment.repository';
import { FixtureResultRepository } from './repositories/fixture-result.repository';
import { FixtureRepository } from './repositories/fixture.repository';
import { SportCategoryRepository } from './repositories/sport-category.repository';
import { SportOdRequestRepository } from './repositories/sport-od-request.repository';
import { SportRepository } from './repositories/sport.repository';
import { SportsAchievementRepository } from './repositories/sports-achievement.repository';
import { SportsFacultyRepository } from './repositories/sports-faculty.repository';
import { SportsInjuryRepository } from './repositories/sports-injury.repository';
import { SportsProfileRepository } from './repositories/sports-profile.repository';
import { SportsTrialRepository } from './repositories/sports-trial.repository';
import { StaffRepository } from './repositories/staff.repository';
import { TeamMemberRepository } from './repositories/team-member.repository';
import { TeamRepository } from './repositories/team.repository';
import { TournamentRepository } from './repositories/tournament.repository';
import { TrainingAttendanceRepository } from './repositories/training-attendance.repository';
import { TrainingSessionRepository } from './repositories/training-session.repository';
import { SportOdRequestsController } from './sport-od-requests.controller';
import { SportOdRequestService } from './sport-od-request.service';
import { SportsAdminOverviewController } from './sports-admin-overview.controller';
import { SportsAdminOverviewService } from './sports-admin-overview.service';
import { SportsApprovalHandlers } from './sports-approval-handlers.service';
import { SportsBudgetRequestsController } from './sports-budget-requests.controller';
import { SportsEquipmentIndentsController } from './sports-equipment-indents.controller';
import { SportsEquipmentOperationsController } from './sports-equipment-operations.controller';
import { SportsEquipmentOperationsService } from './sports-equipment-operations.service';
import { SportsController } from './sports.controller';
import { SportsFacultyAchievementsController } from './sports-faculty-achievements.controller';
import { SportsFacultyAchievementsService } from './sports-faculty-achievements.service';
import { SportsFacultyProfilesController } from './sports-faculty-profiles.controller';
import { SportsFacultyProfilesService } from './sports-faculty-profiles.service';
import { SportsFacultyTeamsController } from './sports-faculty-teams.controller';
import { SportsFacultyTeamsService } from './sports-faculty-teams.service';
import { SportsFacultyTournamentsService } from './sports-faculty-tournaments.service';
import { SportsFacultyTrainingController } from './sports-faculty-training.controller';
import { SportsFacultyTrainingService } from './sports-faculty-training.service';
import {
  SportsFacultyFixturesController,
  SportsFacultyTournamentsController,
  SportsHousesController,
} from './sports-faculty-tournaments.controller';
import { SportsInjuriesController } from './sports-injuries.controller';
import { SportsInjuriesService } from './sports-injuries.service';
import { SportsPtController } from './sports-pt.controller';
import { SportsTrialsController } from './sports-trials.controller';
import { SportsTrialsService } from './sports-trials.service';
import { SportsService } from './sports.service';
import { SportsPracticePlansController } from './sports-practice-plans.controller';
import { SportsPracticePlansService } from './sports-practice-plans.service';
import { SportsPracticePlanRepository } from './repositories/sports-practice-plan.repository';
import { SportsResultEntriesController } from './sports-result-entries.controller';
import { SportsResultEntriesService } from './sports-result-entries.service';
import { SportsResultEntryRepository } from './repositories/sports-result-entry.repository';
import { SportsSelectionWindowsController } from './sports-selection-windows.controller';
import { SportsSelectionWindowsService } from './sports-selection-windows.service';
import { SportsSelectionWindowRepository } from './repositories/sports-selection-window.repository';
import { SportsSubstituteCoachesController } from './sports-substitute-coaches.controller';
import { SportsSubstituteCoachesService } from './sports-substitute-coaches.service';
import { SportsSubstituteCoachRepository } from './repositories/sports-substitute-coach.repository';

@Module({
  // ApprovalsModule: OD requests route through the generic approvals engine
  // (single PRINCIPAL step). FinanceModule: equipment restock reuses
  // PurchaseRequestsService/repositories as-is (same pattern MediaModule
  // already uses for its own indent feature). StudentEventsModule: an approved
  // OD request becomes a real parent-facing consent request by reusing the
  // ALREADY-LIVE student_event/student_event_participant tables, not a new
  // parallel system.
  // TimetableModule: PT / sports periods reuses the real, already-populated
  // timetable_slot data for the "Physical Training" subject (see
  // sports-pt.controller.ts's own header comment) -- no new schema at all.
  imports: [ApprovalsModule, FinanceModule, StudentEventsModule, TimetableModule],
  // IMPORTANT — controller order matters here: Nest/Express match routes in
  // registration order, not by specificity (same trap PurchaseRequestsController's
  // own "summary before :id" comment documents). SportsController owns the
  // generic GET/PATCH /sports/:id (ADMIN-only) — every other controller below
  // that also has a literal 2-segment path directly under /sports (teams,
  // tournaments, fixtures, achievements, equipment-indents, od-requests) MUST
  // be registered BEFORE it, or a request like GET /sports/teams gets
  // swallowed by /sports/:id (id="teams") and wrongly 403s a Faculty caller
  // against the ADMIN-only handler. Discovered live during Phase-1 testing —
  // see git history / conversation for the exact repro.
  controllers: [
    EquipmentController,
    CoachesController,
    SportsAdminOverviewController,
    SportsFacultyTeamsController,
    SportsEquipmentOperationsController,
    SportsEquipmentIndentsController,
    SportOdRequestsController,
    SportsFacultyProfilesController,
    SportsFacultyTrainingController,
    SportsFacultyTournamentsController,
    SportsFacultyFixturesController,
    SportsHousesController,
    SportsFacultyAchievementsController,
    SportsTrialsController,
    SportsInjuriesController,
    SportsBudgetRequestsController,
    SportsPtController,
    SportsPracticePlansController,
    SportsResultEntriesController,
    SportsSelectionWindowsController,
    SportsSubstituteCoachesController,
    SportsController,
  ],
  providers: [
    AuditService,
    UnitOfWork,
    SportsService,
    EquipmentService,
    CoachesService,
    SportRepository,
    SportCategoryRepository,
    EquipmentRepository,
    CoachRepository,
    StaffRepository,
    SportsFacultyRepository,
    TeamRepository,
    TeamMemberRepository,
    EquipmentIssueRepository,
    SportOdRequestRepository,
    SportsFacultyTeamsService,
    SportsEquipmentOperationsService,
    SportOdRequestService,
    SportsApprovalHandlers,
    SportsProfileRepository,
    SportsFacultyProfilesService,
    TrainingSessionRepository,
    TrainingAttendanceRepository,
    SportsFacultyTrainingService,
    TournamentRepository,
    FixtureRepository,
    FixtureResultRepository,
    SportsFacultyTournamentsService,
    AchievementRepository,
    SportsAchievementRepository,
    SportsFacultyAchievementsService,
    SportsAdminOverviewService,
    SportsTrialRepository,
    SportsTrialsService,
    SportsInjuryRepository,
    SportsInjuriesService,
    SportsPracticePlanRepository,
    SportsPracticePlansService,
    SportsResultEntryRepository,
    SportsResultEntriesService,
    SportsSelectionWindowRepository,
    SportsSelectionWindowsService,
    SportsSubstituteCoachRepository,
    SportsSubstituteCoachesService,
  ],
  // PrincipalDashboardService needs SportsAdminOverviewService directly for the
  // shared Principal/VP/Correspondent/Admin dashboard summary's real "upcoming
  // fixtures" figure -- same reuse pattern InventoryModule/MaintenanceModule/
  // LibraryModule already export their own overview services for.
  exports: [SportsAdminOverviewService],
})
export class SportsModule {}
