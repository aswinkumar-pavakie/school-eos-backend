// Thin REST wrapper over Razorpay's Orders API — no SDK dependency, same philosophy
// as the rest of this backend (raw pg over an ORM, native fetch over an HTTP-client
// library). Key Secret never leaves this file: it's used only to build the Basic
// Auth header for server-to-server calls, never returned to a caller. keyId is the
// one value the mobile app legitimately needs (Razorpay's own checkout requires it
// client-side to open — it identifies the merchant, not a secret).

import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface RazorpayOrder {
  id: string;
}

@Injectable()
export class RazorpayService {
  constructor(private readonly configService: ConfigService) {}

  get keyId(): string {
    const keyId = this.configService.get<string>('razorpay.keyId');
    if (!keyId)
      throw new ServiceUnavailableException(
        'Online fee payment is not configured yet — contact the school office.',
      );
    return keyId;
  }

  private authHeader(): string {
    const keyId = this.configService.get<string>('razorpay.keyId');
    const keySecret = this.configService.get<string>('razorpay.keySecret');
    if (!keyId || !keySecret) {
      throw new ServiceUnavailableException(
        'Online fee payment is not configured yet — contact the school office.',
      );
    }
    return 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  }

  /** amountPaise maps 1:1 onto Razorpay's `amount` for INR — Razorpay's smallest unit
   * for the rupee IS paise, so no conversion either direction. */
  async createOrder(input: {
    amountPaise: string;
    receipt: string;
    notes: Record<string, string>;
  }): Promise<RazorpayOrder> {
    let res: Response;
    try {
      res = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.authHeader(),
        },
        body: JSON.stringify({
          amount: Number(input.amountPaise),
          currency: 'INR',
          receipt: input.receipt,
          notes: input.notes,
          payment_capture: 1,
        }),
      });
    } catch {
      throw new ServiceUnavailableException(
        'Could not reach the payment gateway. Please try again.',
      );
    }
    const json: any = await res.json().catch(() => null);
    if (!res.ok || !json?.id) {
      throw new ServiceUnavailableException(
        json?.error?.description ??
          'Could not start the payment. Please try again.',
      );
    }
    return { id: json.id };
  }
}
