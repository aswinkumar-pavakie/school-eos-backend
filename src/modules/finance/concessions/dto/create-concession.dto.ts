import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

// Real DB CHECK constraint (concession_concession_type_check) — not values invented for this build.
export const CONCESSION_TYPES = [
  'SIBLING',
  'STAFF_WARD',
  'SCHOLARSHIP',
  'RTE',
  'MERIT',
  'HARDSHIP',
  'GOVT_SCHEME',
  'OTHER',
] as const;

export class CreateConcessionDto {
  @IsUUID()
  studentId!: string;

  @IsUUID()
  academicYearId!: string;

  @IsIn(CONCESSION_TYPES)
  concessionType!: (typeof CONCESSION_TYPES)[number];

  // Exactly one of amountPaise/percent is required — enforced in ConcessionsService
  // (concession_amount_or_pct is a DB-level XOR constraint; class-validator's
  // @ValidateIf can't express "exactly one of two optional fields" reliably).
  @IsOptional()
  @Matches(/^[0-9]+$/, {
    message: 'amountPaise must be a non-negative integer string',
  })
  amountPaise?: string;

  @IsOptional()
  @Matches(/^(100|[0-9]{1,2})(\.[0-9]{1,2})?$/, {
    message: 'percent must be between 0 and 100 with up to 2 decimal places',
  })
  percent?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}
