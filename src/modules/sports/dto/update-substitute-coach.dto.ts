import { IsIn, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import { SUBSTITUTE_COACH_STATUSES } from '../repositories/sports-substitute-coach.repository';

export class UpdateSubstituteCoachDto {
  @IsOptional()
  @IsISO8601({ strict: true })
  startDate?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  endDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsIn(SUBSTITUTE_COACH_STATUSES)
  status?: string;
}
