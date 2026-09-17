import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

// Mirrors CreateVehicleDocumentDto exactly -- same shape, same validation
// rules, driver's own doc_type set. LICENCE and POLICE_VERIFICATION here are
// deliberately independent of driver.licence_expiry/verification_expiry
// (those two columns already exist and track the structured number+expiry
// data used elsewhere) -- this table is for the actual document/file
// attachment (with its own expiry), not a replacement for those columns. See
// query.md's own note on this for the follow-up decision on whether to
// reconcile the two down the line.
export class CreateDriverDocumentDto {
  @IsIn(['LICENCE', 'MEDICAL_CERTIFICATE', 'POLICE_VERIFICATION', 'OTHER'])
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
