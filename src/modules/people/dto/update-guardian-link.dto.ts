import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdateGuardianLinkDto {
  @IsOptional()
  @IsIn(['FATHER', 'MOTHER', 'GUARDIAN', 'GRANDPARENT', 'SIBLING', 'OTHER'])
  relationship?: string;

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
