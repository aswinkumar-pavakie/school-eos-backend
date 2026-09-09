import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';

// Real DB CHECK constraint (payment_mode_check) — not a value invented for this build.
export type PaymentMode =
  'UPI' | 'CARD' | 'NETBANKING' | 'CASH' | 'CHEQUE' | 'DD' | 'WALLET_TOPUP';
export const OFFLINE_MODES: PaymentMode[] = ['CASH', 'CHEQUE', 'DD'];
export const ONLINE_MODES: PaymentMode[] = [
  'UPI',
  'CARD',
  'NETBANKING',
  'WALLET_TOPUP',
];

export class CreatePaymentDto {
  @Matches(/^[1-9][0-9]*$/, {
    message: 'amountPaise must be a positive integer string',
  })
  amountPaise!: string;

  @IsIn(['UPI', 'CARD', 'NETBANKING', 'CASH', 'CHEQUE', 'DD', 'WALLET_TOPUP'])
  mode!: PaymentMode;

  @IsOptional()
  @IsUUID()
  paidByPersonId?: string;

  // Required — a client-generated key preventing a double-tap/double-submit from
  // recording the same payment twice. Backed by payment.idempotency_key's DB-level
  // UNIQUE constraint; a retry with the same key returns the original payment.
  @IsString()
  @IsNotEmpty()
  idempotencyKey!: string;

  // Required for the 4 gateway-mediated modes (which gateway will process this intent);
  // ignored for CASH/CHEQUE/DD, which Finance confirms directly under its own authority.
  @IsOptional()
  @IsString()
  gateway?: string;
}
