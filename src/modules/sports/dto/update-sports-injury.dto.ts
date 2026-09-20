import { IsBoolean, IsIn, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import { INJURY_STATUSES } from '../repositories/sports-injury.repository';

export class UpdateSportsInjuryDto {
  @IsOptional()
  @IsIn(INJURY_STATUSES)
  status?: string;

  @IsOptional()
  @IsBoolean()
  guardianInformed?: boolean;

  // Full-record edit, added alongside status/guardianInformed -- studentId/
  // sportId stay immutable (reassigning a recorded incident to a different
  // student isn't a real edit).
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  incidentDate?: string;
}
