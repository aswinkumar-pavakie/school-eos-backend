import { IsDateString, IsIn, IsOptional } from 'class-validator';

export class ShootAssignmentQueryDto {
  @IsOptional()
  @IsIn(['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
  status?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
