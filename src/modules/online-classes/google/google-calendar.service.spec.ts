// Regression test for a real bug caught during Phase 7 verification against a real
// Google account: toLocalDateTimeString previously took a Date (as returned by pg's
// old per-column DATE parser, built from LOCAL components) and read it back with
// .toISOString() (UTC-based), which silently shifted the calendar day back by one
// on a machine whose local timezone is ahead of UTC (this dev machine: unset TZ /
// IST). Also previously appended an extra ":00" to a startTime/endTime that already
// has seconds (Postgres `time` columns always round-trip as "HH:mm:ss"), producing
// a malformed "...T10:00:00:00" string — Google rejected the real request with a
// 400 because of this until both were fixed.
//
// PostgresService now registers a global type parser for DATE columns (OID 1082)
// that returns the column's raw text ('YYYY-MM-DD') untouched instead of a Date
// object at all — removing the whole class of bug at its source. scheduledDate is
// now always already the right string; toLocalDateTimeString is just concatenation.

import { isNotFoundError, toLocalDateTimeString } from './google-calendar.service';

describe('toLocalDateTimeString', () => {
  it('does not append extra seconds to a time that already has them (Postgres `time` shape)', () => {
    expect(toLocalDateTimeString('2026-09-25', '10:00:00')).toBe('2026-09-25T10:00:00');
  });

  it('preserves the exact date string it was given, untouched', () => {
    const result = toLocalDateTimeString('2026-09-25', '14:30:00');
    expect(result).toBe('2026-09-25T14:30:00');
    expect(result).not.toContain('09-24');
  });
});

// isNotFoundError backs both updateEventTime (reschedule sync) and cancelEvent
// (cancellation sync)'s "the Google event is missing" handling — a 410 in particular
// is what Google actually returns for an event that's already been deleted, which is
// exactly the "repeated cancellation" / "already-cancelled event" scenario.
describe('isNotFoundError', () => {
  it('treats a 404 response as not-found', () => {
    expect(isNotFoundError({ response: { status: 404 } })).toBe(true);
  });

  it('treats a 410 (Gone — already deleted) response as not-found', () => {
    expect(isNotFoundError({ response: { status: 410 } })).toBe(true);
  });

  it('does not treat other statuses as not-found', () => {
    expect(isNotFoundError({ response: { status: 400 } })).toBe(false);
    expect(isNotFoundError({ response: { status: 401 } })).toBe(false);
    expect(isNotFoundError({ response: { status: 500 } })).toBe(false);
  });

  it('does not crash and returns false on a malformed/missing error shape', () => {
    expect(isNotFoundError(undefined)).toBe(false);
    expect(isNotFoundError(new Error('network blip'))).toBe(false);
    expect(isNotFoundError({})).toBe(false);
  });
});
