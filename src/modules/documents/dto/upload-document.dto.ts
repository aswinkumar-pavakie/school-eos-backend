import { IsIn, IsOptional, IsString } from 'class-validator';

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
  'PEOPLE',
];

// Multipart form fields alongside the file itself -- objectKey/fileName/mimeType/
// sizeBytes are derived from the uploaded file server-side, not caller-supplied
// (unlike the metadata-only POST /documents, which trusts an already-uploaded key).
export class UploadDocumentDto {
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

  // Plain 'true'/'false' string (multipart fields always arrive as strings) --
  // matches this codebase's usual convention over @Type(() => Boolean), which
  // would coerce any non-empty string, including the literal text "false", to true.
  @IsOptional()
  @IsIn(['true', 'false'])
  isRestricted?: string;
}
