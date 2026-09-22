// Generic LiveKit integration -- exports LiveKitService only. Deliberately
// has no knowledge of staff_meeting_booking or any other domain table; the
// webhook that updates that table lives in the faculty module instead (see
// parent-meeting-call-webhook.controller.ts), matching this codebase's own
// convention of co-locating a webhook receiver with the domain it updates
// (payment-webhook.controller.ts lives in finance/payments, not a generic
// "webhooks" module).

import { Module } from '@nestjs/common';
import { LiveKitService } from './livekit.service';

@Module({
  providers: [LiveKitService],
  exports: [LiveKitService],
})
export class LiveKitModule {}
