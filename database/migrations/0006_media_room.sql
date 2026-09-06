-- Media Room module: a new real login (role MEDIA_ROOM), shoot assignments, a
-- media equipment inventory category (reuses the existing generic inventory_item/
-- inventory_category tables -- a camera register is not a different shape of thing
-- than a lab-equipment register), social media publishing to the mobile app's
-- Explore feed (with real scheduling -> auto-publish), and equipment indents
-- (reuses the existing purchase_request/purchase_order tables and their already-
-- registered approval handler -- see FinanceApprovalHandlers.onModuleInit's
-- 'purchase_request' handler, which is gateway-agnostic and works unchanged for
-- any requestType that routes an approval at subjectObjectType 'purchase_request').
--
-- Purely additive: no existing columns touched.
-- NOT executed automatically — run this against Supabase yourself.

INSERT INTO role (code, name, is_core_login, description)
VALUES ('MEDIA_ROOM', 'Media Room Head', true, 'Media room: shoot coverage, social media publishing, equipment inventory and indents.')
ON CONFLICT (code) DO NOTHING;

-- Media's own indent routing: straight to Principal, one step, final -- distinct
-- from Finance's own PURCHASE_REQUEST policy (Principal -> Finance). Same
-- purchase_request/purchase_order tables and the same onApproved/onRejected
-- handler underneath; only the policy's requestType key differs, which is how the
-- approvals engine already keys routing (see ApprovalPolicyRepository.resolveStepChain).
INSERT INTO approval_policy
  (request_type, condition, sequence_no, approver_role_code, is_final, sla_hours, is_retrospective, status)
VALUES
  ('MEDIA_INDENT', '{}'::jsonb, 1, 'PRINCIPAL', true, 72, false, 'ACTIVE')
ON CONFLICT ON CONSTRAINT uq_policy_step DO NOTHING;

-- A real category so Media's camera/lens/audio/lighting register lives in the same
-- inventory_item table as every other department's equipment, not a parallel one.
INSERT INTO inventory_category (name, status)
VALUES ('Media & AV Equipment', 'ACTIVE')
ON CONFLICT (name) DO NOTHING;

-- Roster of who actually shoots/edits -- deliberately NOT the same as person +
-- role_assignment: a shoot's crew commonly includes students or short-term help
-- with no system login at all, so person_id is optional (set only when the crew
-- member genuinely is a real staff/faculty person elsewhere in the system).
CREATE TABLE media_team_member (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id    uuid REFERENCES person (id),
  full_name    text NOT NULL,
  designation  text,
  email        text,
  phone        text,
  skills       text[] NOT NULL DEFAULT '{}',
  status       text NOT NULL DEFAULT 'ACTIVE',
  created_by   uuid NOT NULL REFERENCES person (id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_media_team_member_status CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

CREATE TABLE shoot_assignment (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_title  text NOT NULL,
  venue        text,
  scheduled_at timestamptz NOT NULL,
  output_type  text NOT NULL DEFAULT 'PHOTO_VIDEO',
  status       text NOT NULL DEFAULT 'PLANNED',
  notes        text,
  created_by   uuid NOT NULL REFERENCES person (id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_shoot_assignment_output CHECK (output_type IN ('PHOTO', 'VIDEO', 'PHOTO_VIDEO')),
  CONSTRAINT chk_shoot_assignment_status CHECK (status IN ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'))
);

CREATE INDEX idx_shoot_assignment_scheduled_at ON shoot_assignment (scheduled_at);

-- Real crew/gear links (not free-text names) -- who and what a shoot actually used,
-- queryable both ways (a member's own load, an asset's own usage history).
CREATE TABLE shoot_assignment_crew (
  shoot_assignment_id   uuid NOT NULL REFERENCES shoot_assignment (id) ON DELETE CASCADE,
  media_team_member_id  uuid NOT NULL REFERENCES media_team_member (id),
  PRIMARY KEY (shoot_assignment_id, media_team_member_id)
);

CREATE INDEX idx_shoot_assignment_crew_member ON shoot_assignment_crew (media_team_member_id);

CREATE TABLE shoot_assignment_gear (
  shoot_assignment_id  uuid NOT NULL REFERENCES shoot_assignment (id) ON DELETE CASCADE,
  inventory_item_id    uuid NOT NULL REFERENCES inventory_item (id),
  PRIMARY KEY (shoot_assignment_id, inventory_item_id)
);

CREATE INDEX idx_shoot_assignment_gear_item ON shoot_assignment_gear (inventory_item_id);

-- The mobile app's Explore feed post -- real scheduling (publish_at), a real
-- DRAFT -> SCHEDULED -> PUBLISHED/CANCELLED state machine (a background job flips
-- SCHEDULED -> PUBLISHED once publish_at has passed; see MediaPostsScheduler).
-- Publishing this feed to the parent/faculty mobile app itself is a separate,
-- later feature -- this table is real and complete on its own regardless.
CREATE TABLE media_post (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  format          text NOT NULL DEFAULT 'POST',
  category        text NOT NULL DEFAULT 'GENERAL',
  caption         text NOT NULL DEFAULT '',
  first_comment   text,
  link_url        text,
  pin_to_top      boolean NOT NULL DEFAULT false,
  allow_comments  boolean NOT NULL DEFAULT true,
  state           text NOT NULL DEFAULT 'DRAFT',
  publish_at      timestamptz,
  published_at    timestamptz,
  created_by      uuid NOT NULL REFERENCES person (id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_media_post_format CHECK (format IN ('POST', 'PHOTO_CAROUSEL', 'VIDEO', 'ANNOUNCEMENT_CARD')),
  CONSTRAINT chk_media_post_category CHECK (category IN ('EVENT', 'ACADEMIC', 'DEPARTMENT', 'GENERAL')),
  CONSTRAINT chk_media_post_state CHECK (state IN ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'CANCELLED')),
  CONSTRAINT chk_media_post_scheduled_has_time CHECK (state <> 'SCHEDULED' OR publish_at IS NOT NULL)
);

CREATE INDEX idx_media_post_state_publish_at ON media_post (state, publish_at);

-- Multi-image/video carousel -- several rows per post, first one (lowest
-- sort_order) is the cover, same real-storage-object-key pattern documents.ts
-- already uses (Supabase Storage, never a base64 blob in the row itself).
CREATE TABLE media_post_asset (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_post_id  uuid NOT NULL REFERENCES media_post (id) ON DELETE CASCADE,
  object_key     text NOT NULL,
  media_type     text NOT NULL,
  sort_order     int NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_media_post_asset_type CHECK (media_type IN ('IMAGE', 'VIDEO'))
);

CREATE INDEX idx_media_post_asset_post_id ON media_post_asset (media_post_id);

-- Comment moderation on a published post -- commenter_person_id is set when the
-- commenter is a real logged-in person (student/parent/faculty); commenter_label
-- is the display fallback otherwise. One reply per comment (matches the design's
-- own "Reply" affordance -- not full threading).
CREATE TABLE media_post_comment (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_post_id        uuid NOT NULL REFERENCES media_post (id) ON DELETE CASCADE,
  commenter_person_id  uuid REFERENCES person (id),
  commenter_label      text,
  body                 text NOT NULL,
  staff_reply          text,
  staff_replied_by     uuid REFERENCES person (id),
  staff_replied_at     timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_media_post_comment_who CHECK (commenter_person_id IS NOT NULL OR commenter_label IS NOT NULL)
);

CREATE INDEX idx_media_post_comment_post_id ON media_post_comment (media_post_id);
