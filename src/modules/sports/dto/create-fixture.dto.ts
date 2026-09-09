import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateFixtureDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  round?: string;

  @IsISO8601()
  scheduledAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  venue?: string;

  @IsOptional()
  @IsUUID()
  homeTeamId?: string;

  @IsOptional()
  @IsUUID()
  awayTeamId?: string;
}
