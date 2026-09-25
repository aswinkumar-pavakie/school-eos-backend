import { Module } from '@nestjs/common';
import { AttendanceDiaryController } from './attendance-diary.controller';
import { AttendanceDiaryService } from './attendance-diary.service';
import { AttendanceDiaryRepository } from './repositories/attendance-diary.repository';

// AuditModule and PostgresModule are provided app-wide (see app.module.ts), so nothing to import.
@Module({
  controllers: [AttendanceDiaryController],
  providers: [AttendanceDiaryService, AttendanceDiaryRepository],
})
export class AttendanceDiaryModule {}
