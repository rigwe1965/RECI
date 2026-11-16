-- Small key/value settings written by the admin portal. First user: the Claude model an admin picked
-- (key 'ai_model', value a JSON string such as "claude-sonnet-5-5"; no row = keep the built-in models).
--
-- Only the server (service role) reads or writes it: row-level security is on with no policies, and the
-- anon/authenticated roles have no privileges, so a browser can never touch it.
--
-- Safe to apply before the code that uses it ships, and the code works (on the built-in models) until it is applied.
-- Rollback:  drop table if exists app_settings;
create table if not exists app_settings (
  key        text        primary key,
  value      jsonb       not null,
  updated_at timestamptz not null default now(),
  updated_by uuid        references auth.users(id) on delete set null
);

alter table app_settings enable row level security;
revoke all on app_settings from anon, authenticated;
