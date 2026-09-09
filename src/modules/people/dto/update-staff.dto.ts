import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

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

  // See create-staff.dto.ts's own comment -- admin-entered after reviewing
  // this staff member's uploaded certificates, not derived from tenure.
  @IsOptional()
  @IsInt()
  @Min(0)
  experienceYears?: number;
}
