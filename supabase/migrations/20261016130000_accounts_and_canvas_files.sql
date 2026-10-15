-- Two things for signed-in accounts and reading Canvas files.
--
-- 1. users.auth_user_id is unique. lib/data/user.ts makes a public.users row
--    the first time a Supabase Auth account signs in, as an upsert on
--    auth_user_id, so two first requests at once make one row, not two. Rows
--    without an account (the old shared dev user) keep auth_user_id null; a
--    unique index allows any number of nulls.
--
-- 2. canvas_files: the text of each Canvas file a sync finds (lecture slides,
--    readings, briefs), read once by lib/data/canvas-files so later syncs skip
--    it. Canvas gives a changed file a new id, so a row never goes stale. Files
--    belong to a course, like course_content, so one read serves everyone in it.
--
--      status  pending  found, not read yet
--              read     `text` holds what's in it (cut at 50,000 characters)
--              empty    nothing to read in it, e.g. a scan with no text layer
--              skipped  not a document, too big, or Canvas won't serve it: `note` says which
--              failed   reading it went wrong; tried again on later syncs, up to 3 attempts
--
-- Like every other table here, RLS is on with no policies: the app reads and
-- writes it from server route handlers using the service role key.

begin;

create unique index if not exists users_auth_user_id_key on public.users (auth_user_id);

create table if not exists public.canvas_files (
  course_id        uuid not null references public.courses(id) on delete cascade,
  external_file_id text not null,
  name             text,
  content_type     text,
  size_bytes       bigint,
  status           text not null default 'pending'
                     check (status in ('pending', 'read', 'empty', 'skipped', 'failed')),
  text             text,
  note             text,
  attempts         smallint not null default 0,
  read_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (course_id, external_file_id)
);

-- What a sync's file reading looks for: files still to read, by subject.
create index if not exists idx_canvas_files_waiting
  on public.canvas_files (course_id, created_at)
  where status in ('pending', 'failed');

alter table public.canvas_files enable row level security;

commit;
