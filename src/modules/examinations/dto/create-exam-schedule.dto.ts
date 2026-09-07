import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
} from 'class-validator';

export class CreateExamScheduleDto {
  @IsUUID()
  subjectOfferingId!: string;

  @IsOptional()
  @IsDateString()
  examDate?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, { message: 'startTime must be HH:mm or HH:mm:ss' })
  startTime?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @IsOptional()
  @IsString()
  room?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  maxMarks!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  passMarks?: number;

  @IsOptional()
  @IsBoolean()
  hasPractical?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  practicalMax?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  internalMax?: number;
}
