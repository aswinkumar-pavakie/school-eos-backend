import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsInt, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';

// subjectOfferingId is deliberately not editable here -- a schedule row is
// created for a specific subject offering; to change the subject, delete and
// re-create (no delete endpoint exists yet either -- schedules are additive
// during DRAFT, matching the exam-not-locked guard in the service).
export class UpdateExamScheduleDto {
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

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  maxMarks?: number;

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
