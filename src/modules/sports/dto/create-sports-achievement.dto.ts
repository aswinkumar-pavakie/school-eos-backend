import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

// At least one of teamId/tournamentId is required — that's what lets the
// service resolve which sport this achievement belongs to for the live
// authorization check (sports_achievement itself has no sport_id column).
export class CreateSportsAchievementDto {
  @IsUUID()
  studentId!: string;

  @ValidateIf((o) => !o.tournamentId)
  @IsUUID()
  teamId?: string;

  @ValidateIf((o) => !o.teamId)
  @IsUUID()
  tournamentId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  placement!: string;

  @IsISO8601({ strict: true })
  awardedOn!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}
