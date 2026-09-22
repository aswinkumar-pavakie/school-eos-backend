// Shared LiveKit integration -- token minting only. This service knows
// nothing about staff_meeting_booking or any other domain table; callers
// (FacultyParentMeetingsService today, the Online Classes broadcast feature
// later) decide WHO gets a token and with WHAT grants after their own real
// authorization checks. LiveKit itself is the signaling channel (its client
// SDKs connect directly to LIVEKIT_URL with the minted token) -- no custom
// WebSocket gateway is needed in this backend at all.
//
// Local dev target: `livekit-server --dev` (Docker or binary) listens on
// ws://localhost:7880 with fixed demo credentials apiKey=devkey,
// apiSecret=secret -- set LIVEKIT_URL/LIVEKIT_API_KEY/LIVEKIT_API_SECRET to
// those for local testing. No TLS/TURN complexity locally; that's a
// deployment-time concern (see rnd for live class.md), not a build blocker.

import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccessToken,
  RoomServiceClient,
  TrackType,
  WebhookReceiver,
} from 'livekit-server-sdk';

export interface MintJoinTokenInput {
  roomName: string;
  identity: string;
  name?: string;
  canPublish: boolean;
  canSubscribe: boolean;
  /** Lets the participant update their own attributes (e.g. a "hand raised"
   * flag) without a server round-trip -- LiveKit syncs attribute changes to
   * everyone in the room automatically. Off by default. */
  canUpdateOwnMetadata?: boolean;
  ttlSeconds?: number;
}

export interface JoinCredentials {
  url: string;
  token: string;
  roomName: string;
}

@Injectable()
export class LiveKitService {
  constructor(private readonly configService: ConfigService) {}

  private requireCredentials(): { url: string; apiKey: string; apiSecret: string } {
    const url = this.configService.get<string>('liveKit.url');
    const apiKey = this.configService.get<string>('liveKit.apiKey');
    const apiSecret = this.configService.get<string>('liveKit.apiSecret');
    if (!url || !apiKey || !apiSecret) {
      throw new InternalServerErrorException(
        'LiveKit is not configured (LIVEKIT_URL/LIVEKIT_API_KEY/LIVEKIT_API_SECRET).',
      );
    }
    return { url, apiKey, apiSecret };
  }

  /** Deterministic, collision-free room name for a booking -- callers never
   * invent their own room-naming scheme. Room creation itself is implicit:
   * LiveKit creates the room on first participant join, no separate "create
   * room" API call is needed. */
  roomNameForBooking(bookingId: string): string {
    return `meeting-${bookingId}`;
  }

  /** Same deterministic-name convention as roomNameForBooking, for the
   * Online Classes broadcast feature. Prefixed differently so the two never
   * collide even though both are plain uuid-derived strings. */
  roomNameForOnlineClass(onlineClassId: string): string {
    return `online-class-${onlineClassId}`;
  }

  async mintJoinToken(input: MintJoinTokenInput): Promise<JoinCredentials> {
    const { url, apiKey, apiSecret } = this.requireCredentials();
    const at = new AccessToken(apiKey, apiSecret, {
      identity: input.identity,
      name: input.name,
      ttl: input.ttlSeconds ?? 2 * 60 * 60, // 2h default, matches plan
    });
    at.addGrant({
      room: input.roomName,
      roomJoin: true,
      canPublish: input.canPublish,
      canSubscribe: input.canSubscribe,
      canUpdateOwnMetadata: input.canUpdateOwnMetadata ?? false,
    });
    const token = await at.toJwt();
    return { url, token, roomName: input.roomName };
  }

  /** Verifies + parses a LiveKit webhook POST. Throws on a bad/missing
   * signature -- callers must treat any throw as "reject the request",
   * never fall back to trusting an unverified body. */
  async verifyWebhook(rawBody: string, authHeader: string | undefined) {
    const { apiKey, apiSecret } = this.requireCredentials();
    const receiver = new WebhookReceiver(apiKey, apiSecret);
    return receiver.receive(rawBody, authHeader);
  }

  private roomService(): RoomServiceClient {
    const { url, apiKey, apiSecret } = this.requireCredentials();
    // RoomServiceClient takes an http(s) URL, not the ws(s) one clients
    // connect with -- LiveKit's own convention is that the same host serves
    // both; only the scheme differs.
    const httpUrl = url.replace(/^ws/, 'http');
    return new RoomServiceClient(httpUrl, apiKey, apiSecret);
  }

  /** Server-side remote mute -- a participant's own client can only control
   * its own tracks, so a moderator (faculty) muting someone else's mic has
   * to go through this API, not a client-side call. No-op (never throws) if
   * the participant has no live audio track to mute, e.g. they joined with
   * mic already off or already left. */
  async muteParticipantAudio(
    roomName: string,
    identity: string,
    muted: boolean,
  ): Promise<void> {
    const svc = this.roomService();
    const participants = await svc.listParticipants(roomName);
    const participant = participants.find((p) => p.identity === identity);
    const audioTrack = participant?.tracks.find(
      (t) => t.type === TrackType.AUDIO,
    );
    if (!audioTrack) return;
    await svc.mutePublishedTrack(
      roomName,
      identity,
      audioTrack.sid,
      muted,
    );
  }

  /** Ends the call for everyone -- disconnects every participant and closes
   * the room. Safe to call on a room that no longer exists (or never
   * existed, e.g. nobody ever joined): LiveKit's DeleteRoom is idempotent. */
  async endRoom(roomName: string): Promise<void> {
    await this.roomService().deleteRoom(roomName);
  }
}
