import { IsIn, IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { TRIAL_ROUNDS } from '../repositories/sports-trial.repository';

export class CreateSportsTrialDto {
  @IsUUID()
  studentId!: string;

  @IsUUID()
  sportId!: string;

  @IsIn(TRIAL_ROUNDS)
  round!: string;

  @IsISO8601({ strict: true })
  trialDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  score?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
