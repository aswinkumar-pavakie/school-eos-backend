import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateStaffDto {
  @IsOptional()
  @IsString()
  employeeNo?: string;

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
}
