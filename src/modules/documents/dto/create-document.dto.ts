import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

const OWNER_DOMAINS = [
  'ORGANIZATION',
  'ACADEMICS',
  'ASSESSMENT',
  'DEVELOPMENT',
  'COMMUNITY',
  'SPORTS',
  'FINANCE',
  'HOSTEL',
  'TRANSPORT',
  'COMMUNICATION',
  'AUDIT',
  // Personal documents for a specific student/staff/parent (certificates, etc.) --
  // added once document_owner_domain_check was widened to allow it (see query.md).
  'PEOPLE',
];

export class CreateDocumentDto {
  @IsIn(OWNER_DOMAINS)
  ownerDomain!: string;

  @IsString()
  ownerObjectType!: string;

  @IsString()
  ownerObjectId!: string;

  @IsString()
  category!: string;

  @IsString()
  docType!: string;

  @IsString()
  objectKey!: string;

  @IsString()
  fileName!: string;

  @IsString()
  mimeType!: string;

  @IsInt()
  @Min(1)
  sizeBytes!: number;

  @IsOptional()
  @IsString()
  checksumSha256?: string;

  @IsOptional()
  @IsBoolean()
  isRestricted?: boolean;

  @IsOptional()
  @IsDateString()
  retainUntil?: string;
}
