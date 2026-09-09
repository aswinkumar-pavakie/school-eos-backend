import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateEnrolmentDto {
  @IsString()
  @MinLength(1)
  academicYearId!: string;

  @IsString()
  @MinLength(1)
  sectionId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  rollNo?: number;

  @IsOptional()
  @IsIn(['REGULAR', 'PROMOTED', 'DETAINED', 'READMITTED', 'TRANSFER_IN'])
  enrolmentType?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}
