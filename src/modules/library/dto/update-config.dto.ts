import { IsInt, IsOptional, Min } from 'class-validator';

export class UpdateConfigDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  loanPeriodDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxRenewals?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  finePerDayPaise?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxBooksPerMember?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  reservationHoldDays?: number;
}
