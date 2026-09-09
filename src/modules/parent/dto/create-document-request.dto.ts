import { IsIn, IsString, MinLength } from 'class-validator';

export const DOCUMENT_TYPES = [
  'BONAFIDE_CERTIFICATE',
  'TRANSFER_CERTIFICATE',
  'CHARACTER_CERTIFICATE',
  'STUDY_CERTIFICATE',
  'FEE_STRUCTURE_CERTIFICATE',
  'MIGRATION_CERTIFICATE',
  'DUPLICATE_MARKSHEET',
  'CONDUCT_CERTIFICATE',
] as const;

export class CreateDocumentRequestDto {
  @IsIn(DOCUMENT_TYPES)
  docType!: string;

  @IsString()
  @MinLength(3)
  reason!: string;
}
