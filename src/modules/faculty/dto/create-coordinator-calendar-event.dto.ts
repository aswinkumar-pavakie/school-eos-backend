import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

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
const STAGES = [
  'PRE_PRIMARY',
  'PRIMARY',
  'MIDDLE',
  'SECONDARY',
  'HIGHER_SECONDARY',
];

export class CreateCoordinatorCalendarEventDto {
  /** Which of the coordinator's own (possibly several) stages this event applies to -- validated server-side against their real scope, never inferred. */
  @IsIn(STAGES)
  scopeStage!: string;

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
}
