import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class StudentTransportAllocationQueryDto {
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  routeStopId?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'CHANGED', 'CANCELLED'])
  status?: string;
}
