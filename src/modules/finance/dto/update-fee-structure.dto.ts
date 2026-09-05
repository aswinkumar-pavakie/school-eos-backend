import { IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateFeeStructureDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  gradeId?: string;

  @IsOptional()
  @IsUUID()
  mediumId?: string;

  @IsOptional()
  @IsString()
  category?: string;
}
