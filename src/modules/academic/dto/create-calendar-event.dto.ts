import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateCalendarEventDto {
  @IsUUID()
  academicYearId!: string;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsIn(['HOLIDAY', 'TERM_START', 'TERM_END', 'EXAM_WINDOW', 'PTM', 'FUNCTION', 'COMPETITION', 'WORKING_SATURDAY', 'OTHER'])
  eventType!: string;

  @IsOptional()
  @IsBoolean()
  isHoliday?: boolean;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsIn(['SCHOOL', 'CAMPUS', 'STAGE', 'GRADE', 'SECTION'])
  scopeType?: string;

  @IsOptional()
  @IsUUID()
  scopeId?: string;

  @IsOptional()
  @IsIn(['PRE_PRIMARY', 'PRIMARY', 'MIDDLE', 'SECONDARY', 'HIGHER_SECONDARY'])
  scopeStage?: string;
}
