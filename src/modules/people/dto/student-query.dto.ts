import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class StudentQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'LEFT', 'TC_ISSUED', 'ARCHIVED'])
  status?: string;

  @IsOptional()
  @IsString()
  gradeId?: string;

  @IsOptional()
  @IsString()
  sectionId?: string;

  // Cross-grade filter: matches any section literally named this (e.g. "A"),
  // regardless of which standard it belongs to -- used when the admin picks a
  // section letter without first picking a standard. Ignored if sectionId is
  // also given (that's the more specific filter).
  @IsOptional()
  @IsString()
  sectionName?: string;

  // Comma-separated student ids -- for printing/acting on an explicit hand-picked
  // set (e.g. checkbox selection on the list page) rather than a grade/section
  // filter. Takes precedence over the other filters when given.
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
