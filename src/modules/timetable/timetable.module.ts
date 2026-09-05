import { Module } from '@nestjs/common';
import { TimetableController } from './timetable.controller';
import { TimetableRepository } from './repositories/timetable.repository';
import { TimetableService } from './timetable.service';

@Module({
  controllers: [TimetableController],
  providers: [TimetableService, TimetableRepository],
  exports: [TimetableService],
})
export class TimetableModule {}
