import { Injectable } from '@nestjs/common';
import { CalendarRepository } from './repositories/calendar.repository';
import { FacultyScopeRepository } from './repositories/faculty-scope.repository';

@Injectable()
export class FacultyCalendarService {
  constructor(
    private readonly calendarRepo: CalendarRepository,
    private readonly scopeRepo: FacultyScopeRepository,
  ) {}

  async list(personId: string) {
    const stages = await this.scopeRepo.getRelevantStages(personId);
    const [events, academicYear] = await Promise.all([
      this.calendarRepo.findForStages(stages),
      this.calendarRepo.findCurrentAcademicYear(),
    ]);
    return { events, academicYear };
  }
}
