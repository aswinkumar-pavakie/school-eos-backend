import { IsISO8601, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateExpenseDto {
  @IsOptional()
  @Matches(/^[1-9][0-9]*$/, { message: 'amountPaise must be a positive integer string' })
  amountPaise?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  incurredOn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  vendorName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  billObjectKey?: string;
}
