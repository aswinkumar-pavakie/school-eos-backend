import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

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

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  campusId?: string;

  @IsOptional()
  @IsString()
  bloodGroup?: string;

  @IsOptional()
  @IsIn(['PERMANENT', 'CONTRACT', 'PART_TIME', 'PROBATION', 'VISITING'])
  employmentType?: string;

  @IsOptional()
  @IsString()
  staffRoom?: string;

  @IsOptional()
  @IsString()
  emergencyContactName?: string;

  @IsOptional()
  @IsString()
  emergencyContactPhone?: string;

  @IsOptional()
  @IsString()
  highestQualification?: string;

  @IsOptional()
  @IsString()
  specialization?: string;

  @IsOptional()
  @IsString()
  university?: string;

  @IsOptional()
  @IsInt()
  @Min(1950)
  @Max(2100)
  yearOfGraduation?: number;

  @IsOptional()
  @IsBoolean()
  tetNetCleared?: boolean;

  @IsOptional()
  @IsString()
  areasOfExpertise?: string;

  @IsOptional()
  @IsString()
  certifications?: string;

  @IsOptional()
  @IsString()
  workshopsTraining?: string;

  @IsOptional()
  @IsString()
  achievementsAwards?: string;
}
