// The only file in this module that actually talks to the Google Calendar API.
// Phase 7 added createOrCheckMeeting (initial creation). This adds updateEventTime
// (reschedule sync) and cancelEvent (cancellation sync) — same client-building,
// error-handling, and safety conventions as createOrCheckMeeting, factored into a
// shared private helper rather than duplicated three times.
//
// Never logs the refresh/access token, and never surfaces a raw Google error object —
// only Google's own structured error message field, if present.

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { calendar_v3, google } from 'googleapis';
import { decryptRefreshToken } from './google-token-crypto.util';

const MAX_POLL_ATTEMPTS = 3;
const POLL_DELAY_MS = 700;

export type CalendarCreationOutcome =
  | {
      outcome: 'SUCCEEDED';
      googleCalendarEventId: string;
      googleMeetId: string;
      meetingUrl: string;
    }
  | { outcome: 'PENDING'; googleCalendarEventId: string }
  | { outcome: 'FAILED'; message: string }
  | { outcome: 'NEEDS_REAUTH' };

/** Shared by updateEventTime and cancelEvent — both are "act on an already-existing
 * event" operations with no interesting success payload beyond "it worked". */
export type CalendarSyncOutcome =
  | { outcome: 'SUCCEEDED' }
  | { outcome: 'NOT_FOUND' }
  | { outcome: 'FAILED'; message: string }
  | { outcome: 'NEEDS_REAUTH' };

export interface CreateOrCheckMeetingParams {
  refreshTokenEncrypted: string;
  encryptionKeyId: string;
  /** online_class.id — Google's createRequest.requestId. Also our own signal for
   * whether this is a fresh create (existingEventId null) or a retry/poll of a
   * conference that was still pending last time (existingEventId set). */
  requestId: string;
  existingEventId: string | null;
  topic: string;
  description: string | null;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  timezone: string;
}

export interface UpdateEventTimeParams {
  refreshTokenEncrypted: string;
  encryptionKeyId: string;
  eventId: string;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  timezone: string;
}

export interface CancelEventParams {
  refreshTokenEncrypted: string;
  encryptionKeyId: string;
  eventId: string;
}

@Injectable()
export class GoogleCalendarService {
  constructor(private readonly configService: ConfigService) {}

  async createOrCheckMeeting(
    params: CreateOrCheckMeetingParams,
  ): Promise<CalendarCreationOutcome> {
    const built = this.buildCalendarClient(
      params.refreshTokenEncrypted,
      params.encryptionKeyId,
    );
    if ('error' in built) {
      return {
        outcome: 'FAILED',
        message: 'Could not decrypt stored Google credentials',
      };
    }
    const { calendar } = built;

    try {
      let eventId = params.existingEventId;
      let conferenceData: calendar_v3.Schema$ConferenceData | null | undefined;

      if (!eventId) {
        const insertResponse = await calendar.events.insert({
          calendarId: 'primary',
          conferenceDataVersion: 1,
          requestBody: {
            summary: params.topic,
            description: params.description ?? undefined,
            start: {
              dateTime: toLocalDateTimeString(
                params.scheduledDate,
                params.startTime,
              ),
              timeZone: params.timezone,
            },
            end: {
              dateTime: toLocalDateTimeString(
                params.scheduledDate,
                params.endTime,
              ),
              timeZone: params.timezone,
            },
            conferenceData: {
              createRequest: {
                requestId: params.requestId,
                conferenceSolutionKey: { type: 'hangoutsMeet' },
              },
            },
          },
        });
        eventId = insertResponse.data.id ?? null;
        conferenceData = insertResponse.data.conferenceData;
      } else {
        // Retrying a class whose conference was still pending (or whose status update
        // never got persisted, e.g. a crash right after insert) — never call insert
        // again for an event we already created, only re-check it.
        const getResponse = await calendar.events.get({
          calendarId: 'primary',
          eventId,
        });
        conferenceData = getResponse.data.conferenceData;
      }

      if (!eventId) {
        return {
          outcome: 'FAILED',
          message: 'Google did not return an event id',
        };
      }

      let statusCode = conferenceData?.createRequest?.status?.statusCode;

      // Google's API is explicitly documented as possibly asynchronous here — never
      // assume the Meet URL is available just because the insert call returned. Poll a
      // bounded number of times; if it's still not resolved, we leave it PENDING rather
      // than guessing either way.
      for (
        let attempt = 0;
        statusCode === 'pending' && attempt < MAX_POLL_ATTEMPTS;
        attempt++
      ) {
        await sleep(POLL_DELAY_MS * (attempt + 1));
        const pollResponse = await calendar.events.get({
          calendarId: 'primary',
          eventId,
        });
        conferenceData = pollResponse.data.conferenceData;
        statusCode = conferenceData?.createRequest?.status?.statusCode;
      }

      if (statusCode === 'success') {
        const videoEntryPoint = conferenceData?.entryPoints?.find(
          (entryPoint) => entryPoint.entryPointType === 'video',
        );
        const meetingUrl = videoEntryPoint?.uri;
        const googleMeetId = conferenceData?.conferenceId;
        if (!meetingUrl || !googleMeetId) {
          return {
            outcome: 'FAILED',
            message: 'Google reported success but did not return a Meet link',
          };
        }
        return {
          outcome: 'SUCCEEDED',
          googleCalendarEventId: eventId,
          googleMeetId,
          meetingUrl,
        };
      }

      if (statusCode === 'failure') {
        return {
          outcome: 'FAILED',
          message: 'Google could not create a Meet conference for this event',
        };
      }

      // Exhausted the bounded poll and it's still "pending" — genuinely still in
      // progress on Google's side, not a failure. The event id is real and stored;
      // a later retry re-checks this same event instead of creating a new one.
      return { outcome: 'PENDING', googleCalendarEventId: eventId };
    } catch (err) {
      if (isInvalidGrantError(err)) {
        return { outcome: 'NEEDS_REAUTH' };
      }
      return { outcome: 'FAILED', message: extractSafeErrorMessage(err) };
    }
  }

  /** Reschedule sync: PATCHes only start/end/timeZone on the already-existing event —
   * never events.insert, never touches conferenceData, so the same Google Meet
   * conference is preserved untouched. Nothing is called at all if the caller has no
   * eventId yet (see OnlineClassesService.reschedule — a class whose Google creation
   * never succeeded has nothing to sync). */
  async updateEventTime(
    params: UpdateEventTimeParams,
  ): Promise<CalendarSyncOutcome> {
    const built = this.buildCalendarClient(
      params.refreshTokenEncrypted,
      params.encryptionKeyId,
    );
    if ('error' in built) {
      return {
        outcome: 'FAILED',
        message: 'Could not decrypt stored Google credentials',
      };
    }
    const { calendar } = built;

    try {
      await calendar.events.patch({
        calendarId: 'primary',
        eventId: params.eventId,
        requestBody: {
          start: {
            dateTime: toLocalDateTimeString(
              params.scheduledDate,
              params.startTime,
            ),
            timeZone: params.timezone,
          },
          end: {
            dateTime: toLocalDateTimeString(
              params.scheduledDate,
              params.endTime,
            ),
            timeZone: params.timezone,
          },
        },
      });
      return { outcome: 'SUCCEEDED' };
    } catch (err) {
      if (isInvalidGrantError(err)) {
        return { outcome: 'NEEDS_REAUTH' };
      }
      if (isNotFoundError(err)) {
        return { outcome: 'NOT_FOUND' };
      }
      return { outcome: 'FAILED', message: extractSafeErrorMessage(err) };
    }
  }

  /** Cancellation sync: deletes the Google Calendar event outright. An event that's
   * already gone (404/410 — deleted directly in Google Calendar, or a repeated
   * cancellation attempt) is treated as SUCCEEDED, not FAILED: the goal state ("no
   * confirmed event representing this class") is already true either way, which is
   * what makes this safely idempotent/retryable. */
  async cancelEvent(params: CancelEventParams): Promise<CalendarSyncOutcome> {
    const built = this.buildCalendarClient(
      params.refreshTokenEncrypted,
      params.encryptionKeyId,
    );
    if ('error' in built) {
      return {
        outcome: 'FAILED',
        message: 'Could not decrypt stored Google credentials',
      };
    }
    const { calendar } = built;

    try {
      await calendar.events.delete({
        calendarId: 'primary',
        eventId: params.eventId,
      });
      return { outcome: 'SUCCEEDED' };
    } catch (err) {
      if (isInvalidGrantError(err)) {
        return { outcome: 'NEEDS_REAUTH' };
      }
      if (isNotFoundError(err)) {
        return { outcome: 'SUCCEEDED' };
      }
      return { outcome: 'FAILED', message: extractSafeErrorMessage(err) };
    }
  }

  private buildCalendarClient(
    refreshTokenEncrypted: string,
    encryptionKeyId: string,
  ): { calendar: calendar_v3.Calendar } | { error: 'DECRYPT_FAILED' } {
    const encryptionKeys = this.configService.get<Record<string, string>>(
      'google.tokenEncryptionKeys',
    )!;

    let refreshToken: string;
    try {
      refreshToken = decryptRefreshToken(
        refreshTokenEncrypted,
        encryptionKeyId,
        encryptionKeys,
      );
    } catch {
      return { error: 'DECRYPT_FAILED' };
    }

    const authClient = new google.auth.OAuth2({
      clientId: this.configService.get<string>('google.oauthClientId'),
      clientSecret: this.configService.get<string>('google.oauthClientSecret'),
      redirectUri: this.configService.get<string>('google.oauthRedirectUri'),
    });
    // google-auth-library refreshes the access token from this transparently on the
    // first API call made with it — we never handle an access token ourselves.
    authClient.setCredentials({ refresh_token: refreshToken });

    return { calendar: google.calendar({ version: 'v3', auth: authClient }) };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** scheduledDate is now a raw 'YYYY-MM-DD' string, not a JS Date — PostgresService
 * registers a global type parser for DATE columns (OID 1082) that returns the
 * column's text representation untouched, specifically to avoid the UTC-conversion
 * footgun this function used to work around (a Date object built from pg's own
 * LOCAL year/month/day components would silently shift a day when read back with
 * .toISOString()). With a plain string already in the right shape, no Date object
 * or getters are involved at all — just concatenate it with the plain HH:mm the
 * faculty chose. Combined with a separate IANA timeZone field, Google interprets
 * the result as that wall-clock time in that zone — no manual UTC offset math
 * needed. */
export function toLocalDateTimeString(
  scheduledDate: string,
  time: string,
): string {
  // `time` is startTime/endTime as read back from a Postgres `time` column, which pg
  // always returns as "HH:mm:ss" (seconds included) — do not append ":00" again here,
  // that previously produced a malformed "...T10:00:00:00" string Google rejected
  // outright with a 400.
  return `${scheduledDate}T${time}`;
}

function isInvalidGrantError(err: unknown): boolean {
  const data = (err as { response?: { data?: { error?: string } } })?.response
    ?.data;
  return data?.error === 'invalid_grant';
}

/** 404 (Not Found) or 410 (Gone, which Google uses for an already-deleted event) —
 * either way, "no such event", handled the same way by both call sites. */
export function isNotFoundError(err: unknown): boolean {
  const status = (
    err as { response?: { status?: number }; code?: number | string }
  )?.response?.status;
  return status === 404 || status === 410;
}

/** Only ever surfaces Google's own structured error message field — never the raw
 * error/request/config object, which for an authenticated request can carry the
 * Authorization header. */
function extractSafeErrorMessage(err: unknown): string {
  const message = (
    err as { response?: { data?: { error?: { message?: string } } } }
  )?.response?.data?.error?.message;
  return typeof message === 'string' && message.length > 0
    ? message
    : 'Could not reach Google Calendar';
}
