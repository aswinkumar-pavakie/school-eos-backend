import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateLmsLessonPlanDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  content?: string;

  @IsOptional()
  @IsDateString()
  weekStart?: string;
}
