import { IsDateString } from 'class-validator';

export class NightAttendanceQueryDto {
  @IsDateString()
  date!: string;
}
