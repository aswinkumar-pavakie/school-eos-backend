import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateTournamentDto {
  @IsUUID()
  sportId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsString()
  @MaxLength(50)
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
