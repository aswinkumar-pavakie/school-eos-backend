import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ParentQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'SUSPENDED', 'ARCHIVED'])
  status?: string;

  // Comma-separated person ids -- for printing/acting on an explicit hand-picked
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
