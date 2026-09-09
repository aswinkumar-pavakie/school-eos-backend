import { IsDateString, IsUUID } from 'class-validator';

export class AttendanceDayQueryDto {
  @IsUUID()
  sectionId!: string;

  @IsDateString()
  date!: string;
}
