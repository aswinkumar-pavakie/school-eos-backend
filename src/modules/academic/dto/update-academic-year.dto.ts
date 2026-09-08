import { IsDateString, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateAcademicYearDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  // Use POST /academic-years/:id/close to close a year -- it also stamps closed_at.
  // Plain PATCH only allows PLANNED <-> ACTIVE here.
  @IsOptional()
  @IsIn(['PLANNED', 'ACTIVE'])
  status?: string;
}
