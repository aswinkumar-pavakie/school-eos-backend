import { IsIn, IsOptional } from 'class-validator';

export class MediaPostQueryDto {
  @IsOptional()
  @IsIn(['DRAFT', 'SCHEDULED', 'PUBLISHED', 'CANCELLED'])
  state?: string;
}
