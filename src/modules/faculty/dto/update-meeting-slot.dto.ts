import { IsDateString, IsOptional, Matches } from 'class-validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class UpdateMeetingSlotDto {
  @IsOptional()
  @IsDateString()
  meetingDate?: string;

  @IsOptional()
  @Matches(TIME_PATTERN, {
    message: 'fromTime must be in HH:MM 24-hour format',
  })
  fromTime?: string;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'toTime must be in HH:MM 24-hour format' })
  toTime?: string;
}
