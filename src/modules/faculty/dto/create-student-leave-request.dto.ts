import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class CreateStudentLeaveRequestDto {
  @IsUUID()
  studentId!: string;

  @IsDateString()
  fromDate!: string;

  @IsDateString()
  toDate!: string;

  @IsString()
  @MinLength(1)
  reason!: string;

  @IsOptional()
  @IsBoolean()
  skipSchoolTransport?: boolean;

  @IsOptional()
  @IsString()
  attachmentObjectKey?: string;

  @IsOptional()
  @IsString()
  attachmentFileName?: string;
}
