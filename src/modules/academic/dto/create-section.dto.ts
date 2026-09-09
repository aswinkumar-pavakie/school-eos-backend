import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsPositive, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateSectionDto {
  @IsUUID()
  academicYearId!: string;

  @IsUUID()
  gradeId!: string;

  @IsUUID()
  mediumId!: string;

  @IsOptional()
  @IsUUID()
  campusId?: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  capacity?: number;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE', 'ARCHIVED'])
  status?: string;
}
