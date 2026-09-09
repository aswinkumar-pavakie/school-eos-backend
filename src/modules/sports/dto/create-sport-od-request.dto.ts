import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class CreateSportOdRequestDto {
  @IsUUID()
  teamId!: string;

  @IsOptional()
  @IsUUID()
  fixtureId?: string;

  @IsISO8601({ strict: true })
  eventDate!: string;

  @IsString()
  @MinLength(1)
  reason!: string;
}
