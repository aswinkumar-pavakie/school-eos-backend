import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

// aadhaarLast4/district (both on `person`) and religion/nationality/
// admissionQuota/previousSchool/emergencyContactName/emergencyContactPhone
// (all new on `student`) back the Admin "Enroll students" page's Student
// details / Emergency & address cards -- none of these columns existed
// before that page (see query.md's "Enroll Students page" section for the
// exact ALTER TABLEs). Every other field on this DTO was already real.

// Students never log in (no student login exists in this product), so unlike
// Staff/Guardian creation this does NOT take a pre-existing personId -- there is no
// other path that creates a login-less person record. This DTO carries the person's
// own basic fields, and StudentsService.create() creates person + student together
// in one transaction (Person -> Student, matching the dependency chain everywhere
// else in this build).
export class CreateStudentDto {
  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsIn(['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED'])
  gender?: string;

  // At least one of mobile/email is required -- person's own person_has_contact
  // CHECK constraint -- enforced in the service, not here, since it's a
  // cross-field rule.
  @IsOptional()
  @Matches(/^[0-9]{10}$/, { message: 'mobile must be exactly 10 digits' })
  mobile?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  addressLine1?: string;

  @IsOptional()
  @IsString()
  addressLine2?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  pincode?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @Matches(/^[0-9]{4}$/, { message: 'aadhaarLast4 must be exactly 4 digits' })
  aadhaarLast4?: string;

  @IsOptional()
  @IsString()
  religion?: string;

  @IsOptional()
  @IsString()
  nationality?: string;

  @IsOptional()
  @IsString()
  admissionQuota?: string;

  @IsOptional()
  @IsString()
  previousSchool?: string;

  @IsOptional()
  @IsString()
  emergencyContactName?: string;

  @IsOptional()
  @IsString()
  emergencyContactPhone?: string;

  @IsString()
  @MinLength(1)
  admissionNo!: string;

  @IsOptional()
  @IsString()
  stateStudentId?: string;

  @IsDateString()
  admissionDate!: string;

  @IsOptional()
  @IsString()
  mediumId?: string;

  @IsOptional()
  @IsString()
  motherTongue?: string;

  @IsOptional()
  @IsString()
  languageSubjectChoice?: string;

  @IsOptional()
  @IsIn(['SC', 'ST', 'MBC', 'BC', 'OBC', 'MINORITY', 'GENERAL'])
  communityCategory?: string;

  @IsOptional()
  @IsBoolean()
  isFirstGenLearner?: boolean;

  @IsOptional()
  @IsBoolean()
  isDifferentlyAbled?: boolean;

  @IsOptional()
  @IsString()
  supportNeeds?: string;

  @IsOptional()
  @IsString()
  bloodGroup?: string;

  @IsOptional()
  @IsBoolean()
  isHosteller?: boolean;

  @IsOptional()
  @IsBoolean()
  usesSchoolTransport?: boolean;

  @IsOptional()
  @IsIn(['WALK', 'PARENT_DROP', 'PRIVATE_VEHICLE', 'PUBLIC_TRANSPORT', 'OTHER'])
  commuteMode?: string;

  @IsOptional()
  @IsString()
  bankAccountRef?: string;
}
