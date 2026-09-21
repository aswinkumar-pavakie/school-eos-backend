import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

// Real tournament.level values (tournament_level_check) -- an out-of-range
// value here used to fall through unvalidated (level had only @IsString) and
// crash as an uncaught 500 when it hit the DB constraint. Confirmed live.
export const TOURNAMENT_LEVELS = [
  'INTER_HOUSE',
  'INTER_SCHOOL',
  'BLOCK',
  'DISTRICT',
  'STATE',
  'NATIONAL',
] as const;

export class CreateTournamentDto {
  @IsUUID()
  sportId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsIn(TOURNAMENT_LEVELS)
  level!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  format?: string;

  @IsISO8601({ strict: true })
  startDate!: string;

  @IsISO8601({ strict: true })
  endDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  venue?: string;
}
