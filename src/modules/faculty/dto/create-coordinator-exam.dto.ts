import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

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

export class CreateCoordinatorExamDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsIn(EXAM_TYPES)
  examType!: string;

  @IsOptional()
  @IsString()
  term?: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  gradeIds!: string[];
}
