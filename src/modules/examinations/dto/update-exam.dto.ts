import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

const EXAM_TYPES = [
  'UNIT_TEST',
  'MONTHLY',
  'QUARTERLY',
  'HALF_YEARLY',
  'ANNUAL',
  'MODEL',
  'REVISION',
  'PRACTICAL',
  'BOARD',
];

export class UpdateExamDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsIn(EXAM_TYPES)
  examType?: string;

  @IsOptional()
  @IsString()
  term?: string;

  @IsOptional()
  @IsUUID()
  gradeScaleId?: string;

  @IsOptional()
  @IsDateString()
  marksEntryOpensAt?: string;

  @IsOptional()
  @IsDateString()
  marksEntryClosesAt?: string;
}
