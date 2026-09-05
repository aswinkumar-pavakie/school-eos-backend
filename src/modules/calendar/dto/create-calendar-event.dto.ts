import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

const EVENT_TYPES = [
  'HOLIDAY',
  'TERM_START',
  'TERM_END',
  'EXAM_WINDOW',
  'PTM',
  'FUNCTION',
  'COMPETITION',
  'WORKING_SATURDAY',
  'OTHER',
];
const SCOPE_TYPES = ['SCHOOL', 'CAMPUS', 'STAGE', 'GRADE', 'SECTION'];
const STAGES = ['PRE_PRIMARY', 'PRIMARY', 'MIDDLE', 'SECONDARY', 'HIGHER_SECONDARY'];

export class CreateCalendarEventDto {
  @IsUUID()
  academicYearId!: string;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsIn(EVENT_TYPES)
  eventType!: string;

  @IsOptional()
  @IsBoolean()
  isHoliday?: boolean;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsIn(SCOPE_TYPES)
  scopeType!: string;

  // Required with CAMPUS/GRADE/SECTION, forbidden with SCHOOL/STAGE -- matches the
  // real calendar_event_scope CHECK constraint exactly (checked via
  // pg_get_constraintdef, not guessed); enforced in CalendarEventsService.
  @IsOptional()
  @IsUUID()
  scopeId?: string;

  @IsOptional()
  @IsIn(STAGES)
  scopeStage?: string;
}
