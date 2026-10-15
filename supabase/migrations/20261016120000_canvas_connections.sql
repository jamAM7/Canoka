-- canvas_connections: each student's Canvas sign-in, so the app can sync from
-- Canvas wherever it runs (the hosted site has no scraper/.env to read).
--
--   base_url          the Canvas site, an https origin like https://canvas.uts.edu.au
--   token             the student's Canvas access token, in plain text
--   canvas_user_name  who Canvas says the token belongs to, checked when it's saved
--   last_synced_at    when Settings last synced the student's subjects
--
-- The token is stored as-is. Like every other table here, RLS is on with no
-- policies, so the anon key reads nothing and only the app's server code (the
-- service role key) can read it. Anyone with access to the Supabase dashboard
-- can still see it in the table editor.
--
-- Also adds users.timetable_ical_url, the UTS My Timetable iCal link that
-- Settings used to write to .env.local.

begin;

create table if not exists public.canvas_connections (
  user_id          uuid primary key references public.users(id) on delete cascade,
  base_url         text not null check (base_url ~ '^https://[^/]+$'),
  token            text not null,
  canvas_user_name text,
  last_synced_at   timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.canvas_connections enable row level security;

alter table public.users
  add column if not exists timetable_ical_url text;

commit;
