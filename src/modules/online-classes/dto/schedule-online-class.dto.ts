import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { TIME_PATTERN, TIME_PATTERN_MESSAGE } from '../time-format.util';

// subjectOfferingId, not separate subject/class/section fields: subject_offering already
// *is* the resolved (academic_year, section, subject) combination with its assigned
// teacher, so the mobile app supplies that one id rather than three separate pickers
// being re-resolved server-side. See online-classes/README.md.
export class ScheduleOnlineClassDto {
  @IsUUID()
  subjectOfferingId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  topic!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsDateString()
  scheduledDate!: string;

  @Matches(TIME_PATTERN, { message: `startTime ${TIME_PATTERN_MESSAGE}` })
  startTime!: string;

  @Matches(TIME_PATTERN, { message: `endTime ${TIME_PATTERN_MESSAGE}` })
  endTime!: string;
}
