import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

// Real DB CHECK constraint (fee_head_head_type_check) — not values invented for this build.
export const FEE_HEAD_TYPES = [
  'TUITION',
  'SPECIAL',
  'TRANSPORT',
  'HOSTEL',
  'EXAM',
  'LAB',
  'LIBRARY',
  'ID_CARD',
  'OTHER',
] as const;

export class CreateFeeHeadDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsIn(FEE_HEAD_TYPES)
  headType!: (typeof FEE_HEAD_TYPES)[number];

  @IsOptional()
  @IsBoolean()
  isRefundable?: boolean;
}
