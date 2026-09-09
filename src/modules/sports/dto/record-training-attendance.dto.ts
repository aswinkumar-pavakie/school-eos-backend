import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class TrainingAttendanceEntry {
  @IsUUID()
  studentId!: string;

  @IsIn(['PRESENT', 'ABSENT', 'LATE'])
  status!: string;
}

// Bulk, one call per session — mirrors the class-attendance "one row per
// student in one save" convention used elsewhere in this codebase, rather
// than N single-student round trips.
export class RecordTrainingAttendanceDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TrainingAttendanceEntry)
  entries!: TrainingAttendanceEntry[];
}
