// POST /faculty/parent-meetings/call-webhook -- LiveKit-facing, no Bearer
// auth. @Public() exempts it from the global AuthGuard/RolesGuard, same
// posture as payment-webhook.controller.ts: LiveKitService.verifyWebhook
// (livekit-server-sdk's WebhookReceiver) is the real gate, verifying the
// Authorization header's signature over the RAW request body. Any failure
// -- missing header, bad signature, LiveKit not configured -- rejects with
// 401, never falls through to trusting an unverified body. Never add
// @Roles() here; there is no "authorized role" concept for a webhook caller.
//
// Only two event types matter to this feature: participant_joined (drives
// the authoritative "call started" signal + notification to the other
// party) and room_finished (call ended). Every other LiveKit event type is
// silently ignored -- this is intentionally narrow, not a general-purpose
// webhook relay.

import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../common/auth/public.decorator';
import { LiveKitService } from '../livekit/livekit.service';
import { FacultyParentMeetingsService } from './faculty-parent-meetings.service';

@Controller('faculty/parent-meetings')
export class ParentMeetingCallWebhookController {
  constructor(
    private readonly service: FacultyParentMeetingsService,
    private readonly liveKit: LiveKitService,
  ) {}

  @Public()
  @Post('call-webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() request: Request & { rawBody?: Buffer },
    @Body() _body: unknown,
  ) {
    if (!request.rawBody) throw new UnauthorizedException();

    const event = await this.liveKit
      .verifyWebhook(
        request.rawBody.toString('utf8'),
        request.headers['authorization'],
      )
      .catch(() => {
        throw new UnauthorizedException();
      });

    const roomName = event.room?.name;
    if (!roomName || !roomName.startsWith('meeting-')) {
      return { data: { handled: false } };
    }

    if (event.event === 'participant_joined' && event.participant?.identity) {
      await this.service.handleCallStarted(roomName, event.participant.identity);
    } else if (event.event === 'room_finished') {
      await this.service.handleCallEnded(roomName);
    }

    return { data: { handled: true } };
  }
}
