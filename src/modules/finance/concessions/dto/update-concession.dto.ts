import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateConcessionDto {
  @IsOptional()
  @Matches(/^[0-9]+$/, {
    message: 'amountPaise must be a non-negative integer string',
  })
  amountPaise?: string;

  @IsOptional()
  @Matches(/^[0-9]{1,2}(\.[0-9]{1,2})?$/, {
    message: 'percent must be a number with up to 2 decimal places',
  })
  percent?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
