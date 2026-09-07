import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class ListExamsQueryDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'SCHEDULED', 'CONDUCTED', 'MARKS_ENTRY', 'VERIFIED', 'PUBLISHED', 'LOCKED'])
  state?: string;
}
