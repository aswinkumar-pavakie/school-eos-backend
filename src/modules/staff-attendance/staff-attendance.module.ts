import { Module } from '@nestjs/common';
import { StaffAttendanceController } from './staff-attendance.controller';
import { StaffAttendanceService } from './staff-attendance.service';
import { StaffAttendanceRepository } from './repositories/staff-attendance.repository';

@Module({
  controllers: [StaffAttendanceController],
  providers: [StaffAttendanceService, StaffAttendanceRepository],
  exports: [StaffAttendanceService],
})
export class StaffAttendanceModule {}
