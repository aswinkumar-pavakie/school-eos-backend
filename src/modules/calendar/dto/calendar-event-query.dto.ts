import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class CalendarEventQueryDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
