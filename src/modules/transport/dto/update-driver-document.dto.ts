import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateDriverDocumentDto {
  @IsOptional()
  @IsIn(['LICENCE', 'MEDICAL_CERTIFICATE', 'POLICE_VERIFICATION', 'OTHER'])
  docType?: string;

  @IsOptional()
  @IsString()
  docNo?: string;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;

  @IsOptional()
  @IsString()
  objectKey?: string;
}
