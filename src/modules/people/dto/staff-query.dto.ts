import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class StaffQueryDto {
  @IsOptional()
  @IsIn(['ACTIVE', 'ON_LEAVE', 'EXITED'])
  status?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  designation?: string;

  // Plain 'true'/'false' string, not @Type(() => Boolean) -- that coerces any
  // non-empty query string (including the literal text "false") to true, which
  // would silently break this filter.
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

  // Comma-separated staff ids -- for printing/acting on an explicit hand-picked
  // set (e.g. checkbox selection on the list page) rather than a filter.
  @IsOptional()
  @IsString()
  ids?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;
}
