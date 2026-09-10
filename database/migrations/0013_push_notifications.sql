-- Push notifications -- the real notification/notification_delivery/
-- notification_preference tables already exist in the database (confirmed
-- via prisma/schema.prisma) but nothing has ever written to them; this
-- migration adds the one genuinely missing piece: where a person's real
-- Expo push token(s) live, so the backend knows which real device(s) to
-- actually push to. Everything else (notification content, per-channel
-- delivery tracking, per-type preferences/quiet-hours) reuses those real
-- tables as-is.
--
-- Run this yourself against the real database, exactly like every prior
-- migration this session, then confirm back so the backend build can
-- proceed against it.

CREATE TABLE person_device_token (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id        uuid NOT NULL REFERENCES person (id) ON DELETE CASCADE,
  expo_push_token  text NOT NULL UNIQUE,
  platform         text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_person_device_token_platform CHECK (platform IN ('ANDROID', 'IOS'))
);

CREATE INDEX idx_person_device_token_person ON person_device_token (person_id);
