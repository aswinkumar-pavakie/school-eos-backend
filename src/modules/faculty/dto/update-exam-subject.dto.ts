import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
} from 'class-validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class UpdateExamSubjectDto {
  @IsOptional()
  @IsDateString()
  examDate?: string;

  @IsOptional()
  @Matches(TIME_PATTERN, {
    message: 'startTime must be in HH:MM 24-hour format',
  })
  startTime?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  durationMinutes?: number;

  @IsOptional()
  @IsString()
  room?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  maxMarks?: number;

  @IsOptional()
  @IsNumber()
  passMarks?: number;

  @IsOptional()
  @IsBoolean()
  hasPractical?: boolean;

  @IsOptional()
  @IsNumber()
  practicalMax?: number;

  @IsOptional()
  @IsNumber()
  internalMax?: number;
}
