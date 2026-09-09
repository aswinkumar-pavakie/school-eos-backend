import {
  IsDateString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { TIME_PATTERN, TIME_PATTERN_MESSAGE } from '../time-format.util';

export class RescheduleOnlineClassDto {
  @IsDateString()
  scheduledDate!: string;

  @Matches(TIME_PATTERN, { message: `startTime ${TIME_PATTERN_MESSAGE}` })
  startTime!: string;

  @Matches(TIME_PATTERN, { message: `endTime ${TIME_PATTERN_MESSAGE}` })
  endTime!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
