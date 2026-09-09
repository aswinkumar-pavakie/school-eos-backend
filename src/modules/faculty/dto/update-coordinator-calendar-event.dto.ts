import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

const EVENT_TYPES = ['HOLIDAY', 'TERM_START', 'TERM_END', 'EXAM_WINDOW', 'PTM', 'FUNCTION', 'COMPETITION', 'WORKING_SATURDAY', 'OTHER'];

export class UpdateCoordinatorCalendarEventDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(EVENT_TYPES)
  eventType?: string;

  @IsOptional()
  @IsBoolean()
  isHoliday?: boolean;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
