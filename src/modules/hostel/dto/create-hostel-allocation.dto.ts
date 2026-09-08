import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class CreateHostelAllocationDto {
  @IsUUID()
  studentId!: string;

  @IsUUID()
  bedId!: string;

  @IsUUID()
  academicYearId!: string;

  @IsDateString()
  allocatedFrom!: string;

  @IsOptional()
  @IsUUID()
  allocatedBy?: string;
}
