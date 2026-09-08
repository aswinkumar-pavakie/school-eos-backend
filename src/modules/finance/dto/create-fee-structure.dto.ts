import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateFeeStructureDto {
  @IsUUID()
  academicYearId!: string;

  @IsUUID()
  gradeId!: string;

  @IsOptional()
  @IsUUID()
  mediumId?: string;

  @IsOptional()
  @IsString()
  category?: string;
}
