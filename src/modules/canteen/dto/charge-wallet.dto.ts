import { IsInt, IsPositive, IsUUID, Max } from 'class-validator';

// ₹5,000 in paise -- a deliberately generous but finite ceiling on a single
// counter charge. Bounds the damage a fat-fingered amount, a stuck '0' key,
// or a compromised/misbehaving terminal can do in one request; a real
// purchase over this (if it ever happens) should go through Finance, not
// a counter POS. Easy to retune in one place if the real menu ever needs it.
export const MAX_CHARGE_AMOUNT_PAISE = 500_000;

export class ChargeWalletDto {
  @IsUUID()
  studentId!: string;

  @IsInt()
  @IsPositive()
  @Max(MAX_CHARGE_AMOUNT_PAISE)
  amountPaise!: number;

  // Client-generated once per charge ATTEMPT (when the student is picked),
  // reused verbatim on any client-side retry of that same attempt -- see
  // database/migrations/0029_canteen_transaction_idempotency.sql's own
  // header comment for why a POST that moves real money needs this.
  @IsUUID()
  idempotencyKey!: string;
}
