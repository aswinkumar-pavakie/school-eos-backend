import { IsIn, IsString, MinLength } from 'class-validator';

export class CorrectAttendanceRecordDto {
  @IsIn(['PRESENT', 'ABSENT', 'LATE', 'ON_LEAVE', 'HALF_DAY'])
  newStatus!: string;

  @IsString()
  @MinLength(1)
  reason!: string;
}
