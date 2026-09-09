import { Module } from '@nestjs/common';
import { AttendanceRecordsController } from './attendance-records.controller';
import { AttendanceRecordsService } from './attendance-records.service';
import { AttendanceSessionsController } from './attendance-sessions.controller';
import { AttendanceSessionsService } from './attendance-sessions.service';
import { AttendanceCorrectionRepository } from './repositories/attendance-correction.repository';
import { AttendanceRecordRepository } from './repositories/attendance-record.repository';
import { AttendanceSessionRepository } from './repositories/attendance-session.repository';

// DAILY-mode attendance only -- whole-day roll call per section. PERIOD-mode
// (per-subject-period) needs Timetable & Teaching Assignments, which don't exist
// yet; see attendance_session's own nullable subject_offering_id/period_id.
@Module({
  controllers: [AttendanceSessionsController, AttendanceRecordsController],
  providers: [
    AttendanceSessionsService,
    AttendanceRecordsService,
    AttendanceSessionRepository,
    AttendanceRecordRepository,
    AttendanceCorrectionRepository,
  ],
  // Faculty module reuses AttendanceSessionRepository/AttendanceRecordRepository
  // directly (its own auto-seed-present-then-correct pattern, and the same
  // locked-session correction path) rather than a second copy of this logic.
  exports: [
    AttendanceRecordsService,
    AttendanceSessionRepository,
    AttendanceRecordRepository,
    AttendanceCorrectionRepository,
  ],
})
export class AttendanceModule {}
