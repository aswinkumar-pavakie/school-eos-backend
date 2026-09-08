import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class FineQueryDto {
  @IsOptional()
  @IsIn(['PENDING', 'SENT_TO_FINANCE', 'PARTIALLY_PAID', 'PAID', 'WAIVED', 'CANCELLED'])
  status?: string;

  @IsOptional()
  @IsUUID()
  memberId?: string;

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
