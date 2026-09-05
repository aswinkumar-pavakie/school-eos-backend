import { IsISO8601, IsOptional, Matches } from 'class-validator';

export class UpdateObligationDto {
  @IsOptional()
  @Matches(/^[0-9]+$/, { message: 'amountPaise must be a non-negative integer string' })
  amountPaise?: string;

  @IsOptional()
  @Matches(/^[0-9]+$/, { message: 'lateFeePaise must be a non-negative integer string' })
  lateFeePaise?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  dueDate?: string;
}
