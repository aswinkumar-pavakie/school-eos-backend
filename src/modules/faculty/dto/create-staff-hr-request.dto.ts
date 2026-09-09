import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

const CATEGORIES = [
  'SALARY_QUERY',
  'PF_ESI',
  'INCOME_TAX_DECLARATION',
  'INCREMENT_ARREARS',
  'BANK_ACCOUNT_CHANGE',
  'SERVICE_CERTIFICATE',
];

export class CreateStaffHrRequestDto {
  @IsIn(CATEGORIES)
  category!: string;

  @IsString()
  @MinLength(2)
  subject!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  attachmentObjectKey?: string;

  @IsOptional()
  @IsString()
  attachmentFileName?: string;
}
