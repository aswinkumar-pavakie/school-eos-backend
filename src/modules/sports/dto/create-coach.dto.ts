import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateCoachDto {
  // Required unless isExternal is true -- matches the DB's own
  // `is_external OR person_id IS NOT NULL` check constraint; enforced here so a
  // violation surfaces as a clean 400 instead of a raw constraint error.
  @ValidateIf((dto: CreateCoachDto) => dto.isExternal !== true)
  @IsUUID()
  personId?: string;

  @IsString()
  @MinLength(1)
  fullName!: string;

  @IsOptional()
  @IsBoolean()
  isExternal?: boolean;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsString()
  qualification?: string;

  @IsOptional()
  @IsString()
  policeVerificationRef?: string;

  @IsOptional()
  @IsDateString()
  verificationExpiry?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: string;
}
