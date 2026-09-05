import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateStudentDto {
  @IsOptional()
  @IsString()
  admissionNo?: string;

  @IsOptional()
  @IsString()
  stateStudentId?: string;

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

  // Only meaningful when usesSchoolTransport is false -- how they actually get
  // to school otherwise. Not cross-validated against usesSchoolTransport here
  // (matches the DB column, which allows it set regardless).
  @IsOptional()
  @IsIn(['WALK', 'PARENT_DROP', 'PRIVATE_VEHICLE', 'PUBLIC_TRANSPORT', 'OTHER'])
  commuteMode?: string;

  @IsOptional()
  @IsString()
  bankAccountRef?: string;
}
