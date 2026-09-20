import { IsIn, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import { TRIAL_ROUNDS, TRIAL_STATUSES } from '../repositories/sports-trial.repository';

export class UpdateSportsTrialDto {
  @IsOptional()
  @IsIn(TRIAL_STATUSES)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  score?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  // Full-record edit, added alongside status/score/notes -- studentId/
  // sportId stay immutable (reassigning a trial to a different candidate or
  // discipline isn't a real edit, it's a new trial).
  @IsOptional()
  @IsIn(TRIAL_ROUNDS)
  round?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  trialDate?: string;
}
