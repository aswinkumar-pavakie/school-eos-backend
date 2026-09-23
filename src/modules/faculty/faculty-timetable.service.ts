import { Injectable, NotFoundException } from '@nestjs/common';
import { AcademicCoordinatorTimetableRepository } from './repositories/academic-coordinator-timetable.repository';
import { FacultyScopeRepository } from './repositories/faculty-scope.repository';
import { TimetableRepository } from './repositories/timetable.repository';

@Injectable()
export class FacultyTimetableService {
  constructor(
    private readonly timetableRepo: TimetableRepository,
    private readonly scopeRepo: FacultyScopeRepository,
    private readonly coordinatorTimetableRepo: AcademicCoordinatorTimetableRepository,
  ) {}

  async getWeekly(personId: string) {
    const offerings = await this.scopeRepo.getTeachingOfferings(personId);
    const [periods, slots] = await Promise.all([
      this.timetableRepo.findAllPeriods(),
      this.timetableRepo.findSlotsForOfferings(
        offerings.map((o) => o.subjectOfferingId),
      ),
    ]);

    const days = [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      dayOfWeek,
      slots: slots.filter((s) => s.dayOfWeek === dayOfWeek),
    }));

    return { periods, days };
  }

  /** A Class Teacher (Advisor)'s own real class timetable -- every subject's
   * slots for their one advisor section, not "periods I personally teach"
   * (getWeekly above is teaching-offering scoped, meaningless for a
   * CLASS_ADVISOR-only login with no subject_offering of its own). Reuses
   * AcademicCoordinatorTimetableRepository's own findSlotsForSection/
   * findPeriodsForStage read queries -- same real timetable_slot/
   * timetable_period tables, just a different, advisor-scoped authorization
   * path (findAdvisorSectionWithStage) instead of Academic Coordinator's
   * grade-coverage one. */
  async getForAdvisorSection(personId: string) {
    const section = await this.scopeRepo.findAdvisorSectionWithStage(personId);
    if (!section) {
      throw new NotFoundException('You are not the class advisor of any section.');
    }
    const [periods, slots] = await Promise.all([
      this.coordinatorTimetableRepo.findPeriodsForStage(section.stage ?? ''),
      this.coordinatorTimetableRepo.findSlotsForSection(section.sectionId),
    ]);

    const days = [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      dayOfWeek,
      slots: slots.filter((s) => s.dayOfWeek === dayOfWeek),
    }));

    return { section, periods, days };
  }
}
