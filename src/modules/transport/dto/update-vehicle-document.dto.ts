import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateVehicleDocumentDto {
  @IsOptional()
  @IsIn(['INSURANCE', 'FITNESS', 'PERMIT', 'PUC', 'ROAD_TAX', 'OTHER'])
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
