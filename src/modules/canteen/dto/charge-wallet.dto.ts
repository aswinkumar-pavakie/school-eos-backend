import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsPositive,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

// ₹5,000 in paise -- a deliberately generous but finite ceiling on a single
// counter charge. Bounds the damage a fat-fingered quantity/override, a
// stuck '0' key, or a compromised/misbehaving terminal can do in one
// request; a real purchase over this (if it ever happens) should go
// through Finance, not a counter POS. Easy to retune in one place if the
// real menu ever needs it.
export const MAX_CHARGE_AMOUNT_PAISE = 500_000;

export class ChargeItemDto {
  @IsUUID()
  productId!: string;

  @IsInt()
  @IsPositive()
  @Max(500)
  quantity!: number;
}

export class ChargeWalletDto {
  @IsUUID()
  studentId!: string;

  // The real sale -- one row per product the student is buying, each with
  // its own quantity. The server is the only one that ever resolves a
  // productId to its current price/stock (never trusts a client-computed
  // unit price) -- see CanteenService.charge().
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ChargeItemDto)
  items!: ChargeItemDto[];

  // Optional: the vendor may adjust the auto-computed total (a discount, a
  // rounding correction) right before charging. When omitted, the server's
  // own sum of (quantity * unit price) across `items` is charged verbatim.
  // Inventory is ALWAYS decremented by the real `items` quantities
  // regardless of this override -- it only ever changes what the wallet is
  // debited, never what's said to have been sold.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_CHARGE_AMOUNT_PAISE)
  amountOverridePaise?: number;

  // Client-generated once per charge ATTEMPT (when the student is picked),
  // reused verbatim on any client-side retry of that same attempt -- see
  // database/migrations/0029_canteen_transaction_idempotency.sql's own
  // header comment for why a POST that moves real money needs this.
  @IsUUID()
  idempotencyKey!: string;
}
