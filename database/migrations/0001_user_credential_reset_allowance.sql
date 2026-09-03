-- Adds the one-time self-service password-reset gate the Auth module depends on.
-- Parents get exactly one self-service password reset (POST /auth/password-reset/complete
-- sets this to true); only the admin-authorized endpoint
-- (POST /admin/parents/:personId/password-reset) can clear it back to false.
--
-- Purely additive: no existing columns touched, default keeps every current row unlocked.
-- NOT executed automatically — run this against Supabase yourself.

ALTER TABLE user_credential
  ADD COLUMN reset_allowance_used boolean NOT NULL DEFAULT false;
