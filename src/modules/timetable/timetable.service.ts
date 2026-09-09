import { Injectable } from '@nestjs/common';
import { TimetableRepository } from './repositories/timetable.repository';

@Injectable()
export class TimetableService {
  constructor(private readonly timetableRepo: TimetableRepository) {}

  listPeriods() {
    return this.timetableRepo.findPeriods();
  }

  getForSection(sectionId: string) {
    return this.timetableRepo.findBySection(sectionId);
  }

  getForTeacher(teacherStaffId: string) {
    return this.timetableRepo.findByTeacher(teacherStaffId);
  }
}
