import { IsIn, IsString, MinLength } from 'class-validator';

export class CorrectAttendanceRecordDto {
  // ON_DUTY added for Sports OD (on-duty) requests — a student with an
  // approved+parent-signed OD for the day should never show as ABSENT.
  @IsIn(['PRESENT', 'ABSENT', 'LATE', 'ON_LEAVE', 'HALF_DAY', 'ON_DUTY'])
  newStatus!: string;

  @IsString()
  @MinLength(1)
  reason!: string;
}
