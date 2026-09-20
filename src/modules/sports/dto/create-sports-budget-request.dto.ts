import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateSportsBudgetRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  // Matches PurchaseRequestsService.create()'s own field name/shape
  // (estimatedAmountPaise, a string) -- never a client-computed money type.
  @IsString()
  estimatedAmountPaise!: string;
}
