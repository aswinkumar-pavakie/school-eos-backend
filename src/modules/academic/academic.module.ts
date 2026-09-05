// Academic Master Data (Admin's "school setup / master data" scope, per workflow.md):
// school config, campuses, mediums, academic years, grade scales + bands, grades,
// sections, subjects, departments, houses, calendar events. Everything here already
// existed live in the DB before this module -- pure application code, no schema changes.

import { Module } from '@nestjs/common';
import { AcademicYearsController } from './academic-years.controller';
import { AcademicYearsService } from './academic-years.service';
import { CalendarEventsController } from './calendar-events.controller';
import { CalendarEventsService } from './calendar-events.service';
import { CampusesController } from './campuses.controller';
import { CampusesService } from './campuses.service';
import { DepartmentsController } from './departments.controller';
import { DepartmentsService } from './departments.service';
import { GradeScalesController } from './grade-scales.controller';
import { GradeScalesService } from './grade-scales.service';
import { GradesController } from './grades.controller';
import { GradesService } from './grades.service';
import { HousesController } from './houses.controller';
import { HousesService } from './houses.service';
import { MediumsController } from './mediums.controller';
import { MediumsService } from './mediums.service';
import { AcademicYearRepository } from './repositories/academic-year.repository';
import { CalendarEventRepository } from './repositories/calendar-event.repository';
import { CampusRepository } from './repositories/campus.repository';
import { DepartmentRepository } from './repositories/department.repository';
import { GradeScaleRepository } from './repositories/grade-scale.repository';
import { GradeRepository } from './repositories/grade.repository';
import { HouseRepository } from './repositories/house.repository';
import { MediumRepository } from './repositories/medium.repository';
import { SchoolRepository } from './repositories/school.repository';
import { SectionRepository } from './repositories/section.repository';
import { SubjectRepository } from './repositories/subject.repository';
import { SchoolController } from './school.controller';
import { SchoolService } from './school.service';
import { SectionsController } from './sections.controller';
import { SectionsService } from './sections.service';
import { SubjectsController } from './subjects.controller';
import { SubjectsService } from './subjects.service';

// PostgresService/UnitOfWork come from the @Global() PostgresModule -- injected
// directly, no import needed here (see identity.module.ts / admin.module.ts, which
// don't import it either).
@Module({
  controllers: [
    SchoolController,
    AcademicYearsController,
    CampusesController,
    MediumsController,
    GradeScalesController,
    GradesController,
    SectionsController,
    SubjectsController,
    DepartmentsController,
    HousesController,
    CalendarEventsController,
  ],
  providers: [
    SchoolService,
    AcademicYearsService,
    CampusesService,
    MediumsService,
    GradeScalesService,
    GradesService,
    SectionsService,
    SubjectsService,
    DepartmentsService,
    HousesService,
    CalendarEventsService,
    SchoolRepository,
    AcademicYearRepository,
    CampusRepository,
    MediumRepository,
    GradeScaleRepository,
    GradeRepository,
    SectionRepository,
    SubjectRepository,
    DepartmentRepository,
    HouseRepository,
    CalendarEventRepository,
  ],
})
export class AcademicModule {}
