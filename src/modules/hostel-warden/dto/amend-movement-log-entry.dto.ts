import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AmendMovementLogEntryDto {
  @IsOptional()
  @IsDateString()
  expectedReturn?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  calledByName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  calledByPhone?: string;
}
