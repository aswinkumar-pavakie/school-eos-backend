import { IsIn, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { SELECTION_WINDOW_STATUSES } from '../repositories/sports-selection-window.repository';

export class UpdateSelectionWindowDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  opensOn?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  closesOn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsIn(SELECTION_WINDOW_STATUSES)
  status?: string;
}
