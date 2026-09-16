// Examinations (exam + exam_subject / "examination schedule") -- both tables
// already existed live in the DB before this module -- pure application code,
// no schema changes. Deliberately scoped to just these two tables: the wider
// Phase 3 doc block (Assessment Types, Assessments, Assessment Marks, Grade
// Scales, Report Cards) is a separate, much larger future build -- Grade
// Scales already has its own CRUD in AcademicModule and is only read here as
// a reference FK.

import { Module } from '@nestjs/common';
import { ExamsController } from './exams.controller';
import { ExamsService } from './exams.service';
import { ExamRepository } from './repositories/exam.repository';

@Module({
  controllers: [ExamsController],
  providers: [ExamsService, ExamRepository],
  // Faculty module reuses ExamRepository directly for its own narrower,
  // section/offering-scoped read over exam_subject (see
  // faculty-exam-schedule.service.ts) rather than a second copy of this
  // query.
  exports: [ExamRepository],
})
export class ExaminationsModule {}
