import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateStaffDto {
  @IsString()
  @MinLength(1)
  personId!: string;

  @IsString()
  @MinLength(1)
  employeeNo!: string;

  @IsOptional()
  @IsString()
  designation?: string;

  @IsOptional()
  @IsString()
  teacherCategory?: string;

  @IsOptional()
  @IsIn(['GOVERNMENT', 'AIDED', 'MANAGEMENT'])
  postType?: string;

  @IsOptional()
  @IsString()
  stateTeacherId?: string;

  @IsOptional()
  @IsBoolean()
  isTeaching?: boolean;

  @IsDateString()
  dateOfJoining!: string;
}
