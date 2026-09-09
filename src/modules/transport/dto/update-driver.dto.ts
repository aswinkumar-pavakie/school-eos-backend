import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class UpdateDriverDto {
  @IsOptional()
  @IsUUID()
  personId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  fullName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  licenceNo?: string;

  @IsOptional()
  @IsDateString()
  licenceExpiry?: string;

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
