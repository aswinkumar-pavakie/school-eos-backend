import { ArrayMinSize, IsArray, IsDateString, IsIn, IsString, IsUUID, MinLength } from 'class-validator';

export class MarkStaffAttendanceDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  staffIds!: string[];

  @IsDateString()
  date!: string;

  @IsIn(['PRESENT', 'ABSENT'])
  status!: string;

  @IsString()
  @MinLength(1)
  reason!: string;
}
