import { IsNumberString, IsObject, IsOptional, IsUUID } from 'class-validator';

export class RecordFixtureResultDto {
  @IsOptional()
  @IsNumberString()
  homeScore?: string;

  @IsOptional()
  @IsNumberString()
  awayScore?: string;

  @IsOptional()
  @IsUUID()
  winnerTeamId?: string;

  @IsOptional()
  @IsObject()
  resultDetail?: Record<string, unknown>;
}
