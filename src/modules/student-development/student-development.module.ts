// Student Development -- achievement, merit_point, observation,
// discipline_incident already existed live in the DB before this module --
// pure application code, no schema changes.

import { Module } from '@nestjs/common';
import { StudentDevelopmentController } from './student-development.controller';
import { StudentDevelopmentService } from './student-development.service';
import { StudentDevelopmentRepository } from './repositories/student-development.repository';

@Module({
  controllers: [StudentDevelopmentController],
  providers: [StudentDevelopmentService, StudentDevelopmentRepository],
})
export class StudentDevelopmentModule {}
