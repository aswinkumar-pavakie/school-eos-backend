import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateGuardianLinkDto {
  @IsString()
  @MinLength(1)
  personId!: string;

  @IsIn(['FATHER', 'MOTHER', 'GUARDIAN', 'GRANDPARENT', 'SIBLING', 'OTHER'])
  relationship!: string;

  @IsOptional()
  @IsBoolean()
  isPrimaryContact?: boolean;

  @IsOptional()
  @IsIn(['FULL', 'VIEW_ONLY', 'NO_FINANCE'])
  accessLevel?: string;

  @IsOptional()
  @IsBoolean()
  isAuthorisedPickup?: boolean;

  @IsOptional()
  @IsString()
  occupation?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  annualIncomePaise?: number;
}
