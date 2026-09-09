import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class NightAttendanceEntryDto {
  @IsUUID()
  studentId!: string;

  @IsIn(['PRESENT', 'ABSENT'])
  status!: string;
}

export class MarkNightAttendanceDto {
  @IsDateString()
  date!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => NightAttendanceEntryDto)
  entries!: NightAttendanceEntryDto[];
}
