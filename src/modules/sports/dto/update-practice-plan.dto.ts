import { IsIn, IsISO8601, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PRACTICE_PLAN_STATUSES } from '../repositories/sports-practice-plan.repository';

export class UpdatePracticePlanDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  startDate?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  endDate?: string;

  @IsOptional()
  @IsObject()
  weeklyFocus?: Record<string, string>;

  @IsOptional()
  @IsIn(PRACTICE_PLAN_STATUSES)
  status?: string;
}
