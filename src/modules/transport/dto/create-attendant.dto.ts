import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateAttendantDto {
  @IsOptional()
  @IsUUID()
  personId?: string;

  @IsString()
  @MinLength(1)
  fullName!: string;

  @IsOptional()
  @IsString()
  phone?: string;

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
