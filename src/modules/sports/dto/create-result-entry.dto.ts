import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateResultEntryDto {
  @IsUUID()
  studentId!: string;

  @IsUUID()
  sportId!: string;

  @IsOptional()
  @IsUUID()
  tournamentId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  eventName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  resultValue!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  position?: string;
}
