import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { RESULT_ENTRY_STATUSES } from '../repositories/sports-result-entry.repository';

export class UpdateResultEntryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  eventName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  resultValue?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  position?: string;

  @IsOptional()
  @IsIn(RESULT_ENTRY_STATUSES)
  status?: string;
}
