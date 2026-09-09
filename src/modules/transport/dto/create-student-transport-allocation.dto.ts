import { IsDateString, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateStudentTransportAllocationDto {
  @IsUUID()
  studentId!: string;

  @IsUUID()
  routeStopId!: string;

  @IsUUID()
  academicYearId!: string;

  @IsIn(['PICKUP', 'DROP', 'BOTH'])
  direction!: string;

  @IsOptional()
  @IsString()
  feeSlab?: string;

  @IsOptional()
  @IsDateString()
  validFrom?: string;
}
