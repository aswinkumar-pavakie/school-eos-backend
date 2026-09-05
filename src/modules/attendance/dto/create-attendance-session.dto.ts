import { IsDateString, IsString, MinLength } from 'class-validator';

export class CreateAttendanceSessionDto {
  @IsString()
  @MinLength(1)
  sectionId!: string;

  @IsDateString()
  sessionDate!: string;
}
