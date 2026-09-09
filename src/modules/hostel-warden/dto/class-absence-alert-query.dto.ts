import { IsDateString, IsOptional } from 'class-validator';

export class ClassAbsenceAlertQueryDto {
  // Defaults to today (server-side) if omitted -- see the service.
  @IsOptional()
  @IsDateString()
  date?: string;
}
