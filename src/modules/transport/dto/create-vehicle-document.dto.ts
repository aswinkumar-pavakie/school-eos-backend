import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

export class CreateVehicleDocumentDto {
  @IsIn(['INSURANCE', 'FITNESS', 'PERMIT', 'PUC', 'ROAD_TAX', 'OTHER'])
  docType!: string;

  @IsOptional()
  @IsString()
  docNo?: string;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsDateString()
  validTo!: string;

  @IsOptional()
  @IsString()
  objectKey?: string;
}
