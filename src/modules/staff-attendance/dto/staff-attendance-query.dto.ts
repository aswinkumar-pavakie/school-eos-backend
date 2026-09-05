import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';

export class StaffAttendanceQueryDto {
  @IsDateString()
  date!: string;

  // Plain 'true'/'false' string, not @Type(() => Boolean) -- see StaffQueryDto
  // for why that coercion would silently break this filter.
  @IsOptional()
  @IsIn(['true', 'false'])
  isTeaching?: string;

  // Teaching-assignment filters (via subject_offering) -- only meaningful
  // alongside isTeaching=true, ignored otherwise.
  @IsOptional()
  @IsUUID()
  gradeId?: string;

  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;
}
