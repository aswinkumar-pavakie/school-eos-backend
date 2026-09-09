import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class UpdateFixtureDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  round?: string;

  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;

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

  @IsOptional()
  @IsIn(['SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELLED'])
  status?: string;
}
