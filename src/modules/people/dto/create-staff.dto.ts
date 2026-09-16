import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
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

  // Prior work experience in years, as verified by the admin against the
  // certificates uploaded to this staff member's own documents
  // (GET /documents?ownerObjectType=staff&category=STAFF_HR) -- not derived
  // from date_of_joining, which only measures tenure at this school.
  // Optional: entered once certificates have actually been reviewed, not
  // required at account-creation time.
  @IsOptional()
  @IsInt()
  @Min(0)
  experienceYears?: number;

  // Added for the Admit Faculty page (Admin) -- see query.md's own "Admit
  // Faculty page" section. departmentId/campusId are real FKs onto the
  // pre-existing department/campus tables (GET /departments, GET /campuses).
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

  // Academic credentials -- entered here, verified against uploaded
  // certificates at joining (see this staff member's own
  // GET /documents?ownerObjectType=staff&category=STAFF_HR, same as
  // experienceYears above).
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

  // Professional information -- free text (comma/line separated on the
  // client), same discipline as designation: real signal, no fixed lookup
  // table exists or is warranted for it.
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
