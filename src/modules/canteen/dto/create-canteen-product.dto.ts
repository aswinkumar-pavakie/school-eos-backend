import { IsInt, Min, IsString, MaxLength, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

// multipart/form-data -- every field arrives as a string, so numeric fields
// need @Type(() => Number) before their numeric validators run (class-
// validator validates AFTER class-transformer's @Type conversion).
export class CreateCanteenProductDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity!: number;

  // Indian Rupees, in paise (matches every other money column in this
  // codebase -- wallet.balance_paise, canteen_transaction.amount_paise).
  @Type(() => Number)
  @IsInt()
  @Min(0)
  pricePerUnitPaise!: number;
}
