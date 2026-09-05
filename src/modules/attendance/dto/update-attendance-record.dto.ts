import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateAttendanceRecordDto {
  @IsIn(['PRESENT', 'ABSENT', 'LATE', 'ON_LEAVE', 'HALF_DAY'])
  status!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
