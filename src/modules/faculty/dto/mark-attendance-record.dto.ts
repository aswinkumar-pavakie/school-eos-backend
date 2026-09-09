import { IsIn, IsOptional, IsString } from 'class-validator';

export class MarkAttendanceRecordDto {
  @IsIn(['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY'])
  status!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
