import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class StudyAttendanceEntryDto {
  @IsUUID()
  studentId!: string;

  @IsIn(['PRESENT', 'ABSENT'])
  status!: string;
}

export class MarkStudyAttendanceDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StudyAttendanceEntryDto)
  entries!: StudyAttendanceEntryDto[];
}
