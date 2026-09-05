// Sports Setup (Admin's scope, per workflow.md): sport/sport_category catalog,
// equipment master records, and coach registration. Sports Operations (trials,
// teams, training, tournaments, equipment issue/return) is Faculty + Sports
// assignment territory, a later phase -- out of scope here.

import { Module } from '@nestjs/common';
import { CoachesController } from './coaches.controller';
import { CoachesService } from './coaches.service';
import { EquipmentController } from './equipment.controller';
import { EquipmentService } from './equipment.service';
import { CoachRepository } from './repositories/coach.repository';
import { EquipmentRepository } from './repositories/equipment.repository';
import { SportCategoryRepository } from './repositories/sport-category.repository';
import { SportRepository } from './repositories/sport.repository';
import { SportsController } from './sports.controller';
import { SportsService } from './sports.service';

@Module({
  controllers: [SportsController, EquipmentController, CoachesController],
  providers: [
    SportsService,
    EquipmentService,
    CoachesService,
    SportRepository,
    SportCategoryRepository,
    EquipmentRepository,
    CoachRepository,
  ],
})
export class SportsModule {}
