import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsUUID,
  Matches,
  Min,
} from 'class-validator';

export class FeeStructureLineDto {
  @IsUUID()
  feeHeadId!: string;

  @Matches(/^[0-9]+$/, {
    message: 'amountPaise must be a non-negative integer string',
  })
  amountPaise!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  instalmentNo?: number;

  @IsISO8601({ strict: true })
  dueDate!: string;

  @IsOptional()
  @Matches(/^[0-9]+$/, {
    message: 'lateFeePaise must be a non-negative integer string',
  })
  lateFeePaise?: string;
}
