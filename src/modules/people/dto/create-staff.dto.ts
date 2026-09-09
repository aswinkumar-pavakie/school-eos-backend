import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
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
}
