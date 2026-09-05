import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class HostelAllocationQueryDto {
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsUUID()
  bedId?: string;

  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'VACATED', 'TRANSFERRED'])
  status?: string;
}
