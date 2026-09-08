import { Module } from '@nestjs/common';
import { StaffAttendanceController } from './staff-attendance.controller';
import { StaffAttendanceService } from './staff-attendance.service';
import { StaffAttendanceRepository } from './repositories/staff-attendance.repository';

@Module({
  controllers: [StaffAttendanceController],
  providers: [StaffAttendanceService, StaffAttendanceRepository],
  // StaffAttendanceRepository additionally backs Faculty's own read-only "My
  // Attendance" view (faculty/my-attendance) -- same real table, self-scoped.
  exports: [StaffAttendanceService, StaffAttendanceRepository],
})
export class StaffAttendanceModule {}
