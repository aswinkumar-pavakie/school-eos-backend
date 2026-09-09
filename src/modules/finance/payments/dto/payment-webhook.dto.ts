import { IsIn, IsNotEmpty, IsString, Matches } from 'class-validator';

// Generic, gateway-agnostic shape — see Finance README: no specific payment gateway is
// integrated yet, so this is the contract a real gateway's webhook payload would be
// mapped to at the edge (a thin adapter per gateway), not a literal provider schema.
export class PaymentWebhookDto {
  @IsString()
  @IsNotEmpty()
  eventId!: string;

  @IsString()
  @IsNotEmpty()
  gateway!: string;

  @IsString()
  @IsNotEmpty()
  gatewayRef!: string;

  // Our own payment.idempotency_key, echoed back by the gateway if it supports a
  // client reference field — used to find the payment when gatewayRef alone can't
  // (e.g. the very first event for a brand-new intent).
  @IsString()
  @IsNotEmpty()
  paymentReference!: string;

  @Matches(/^[1-9][0-9]*$/, {
    message: 'amountPaise must be a positive integer string',
  })
  amountPaise!: string;

  @IsIn(['CONFIRMED', 'FAILED'])
  status!: 'CONFIRMED' | 'FAILED';
}
