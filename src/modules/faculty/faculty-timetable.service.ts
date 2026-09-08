import { Injectable } from '@nestjs/common';
import { FacultyScopeRepository } from './repositories/faculty-scope.repository';
import { TimetableRepository } from './repositories/timetable.repository';

@Injectable()
export class FacultyTimetableService {
  constructor(
    private readonly timetableRepo: TimetableRepository,
    private readonly scopeRepo: FacultyScopeRepository,
  ) {}

  async getWeekly(personId: string) {
    const offerings = await this.scopeRepo.getTeachingOfferings(personId);
    const [periods, slots] = await Promise.all([
      this.timetableRepo.findAllPeriods(),
      this.timetableRepo.findSlotsForOfferings(offerings.map((o) => o.subjectOfferingId)),
    ]);

    const days = [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      dayOfWeek,
      slots: slots.filter((s) => s.dayOfWeek === dayOfWeek),
    }));

    return { periods, days };
  }
}
