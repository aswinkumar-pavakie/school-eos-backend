import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class FeeStructureQueryDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  gradeId?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'SUPERSEDED'])
  state?: string;
}
