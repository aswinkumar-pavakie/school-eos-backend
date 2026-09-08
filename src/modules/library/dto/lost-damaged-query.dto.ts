import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class LostDamagedQueryDto {
  @IsOptional()
  @IsIn(['LOST', 'DAMAGED'])
  type?: string;

  /** Filters by the copy's CURRENT live status, not a stored field on this
   * table -- e.g. 'AVAILABLE'/'RETIRED' effectively means "resolved". */
  @IsOptional()
  @IsIn(['LOST', 'DAMAGED', 'UNDER_REPAIR', 'RETIRED', 'AVAILABLE'])
  status?: string;

  @IsOptional()
  @IsString()
  search?: string;

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
