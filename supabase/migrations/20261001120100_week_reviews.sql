-- week_reviews: the AI review of a student's notes for one week of a subject.
--
-- ai_note_generations can't hold these: it is per note (note_id is required),
-- and a week can have several notes. One row per review run, newest wins, so a
-- student's earlier reviews stay as history.
--
--   module_id            the week's course_modules row (a Canvas week module or
--                        the app's 'canoka:week:N' placeholder)
--   content              the review: { summary, covered, missing, corrections, questions }
--   note_count           how many notes it covered
--   had_course_content   whether course_content for the week was there to check against
--   content_stale        true when the Canvas scrape failed and stored content was used
--   content_updated_at   when the course_content it was checked against was last changed
--
-- Like every other table here, RLS is on with no policies: the app reads and
-- writes it from server route handlers using the service role key.

begin;

create table if not exists public.week_reviews (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.users(id) on delete cascade,
  course_id          uuid not null references public.courses(id) on delete cascade,
  module_id          uuid not null references public.course_modules(id) on delete cascade,
  content            jsonb not null,
  model_name         text,
  note_count         integer not null default 0 check (note_count >= 0),
  had_course_content boolean not null default false,
  content_stale      boolean not null default false,
  content_updated_at timestamptz,
  created_at         timestamptz not null default now()
);

create index if not exists idx_week_reviews_user_module
  on public.week_reviews (user_id, module_id, created_at desc);

alter table public.week_reviews enable row level security;

commit;
