import {
  IsIn,
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

  // The shared achievement.level column's real check constraint is a
  // competition-level enum (SCHOOL/BLOCK/DISTRICT/.../INTERNATIONAL), not a
  // free-text placement string -- confirmed live (a placement like "1st
  // place" written into it violates achievement_level_check and 500s).
  // Defaults to SCHOOL when not given, matching this table's most common case.
  @IsOptional()
  @IsIn(['SCHOOL', 'BLOCK', 'DISTRICT', 'STATE', 'NATIONAL', 'INTERNATIONAL'])
  level?: string;

  @IsISO8601({ strict: true })
  awardedOn!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}
