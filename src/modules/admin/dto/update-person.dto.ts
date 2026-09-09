import {
  IsDateString,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

// Basic profile fields only. Omitted fields keep their existing value (COALESCE
// semantics in the repository) -- there is no way to explicitly clear mobile/email
// back to null through this endpoint, which is what keeps it impossible to violate
// person's own person_has_contact CHECK (mobile OR email must be set).
export class UpdatePersonDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @Matches(/^[0-9]{10}$/, { message: 'mobile must be exactly 10 digits' })
  mobile?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsIn(['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED'])
  gender?: string;

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
}
