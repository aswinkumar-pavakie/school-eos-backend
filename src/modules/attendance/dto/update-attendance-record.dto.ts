import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateAttendanceRecordDto {
  // ON_DUTY added for Sports OD (on-duty) requests — see correct-attendance-record.dto.ts.
  @IsIn(['PRESENT', 'ABSENT', 'LATE', 'ON_LEAVE', 'HALF_DAY', 'ON_DUTY'])
  status!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
