-- Canoka user data. Every exposed table is private to its authenticated owner.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  study_level text,
  study_goal text,
  learning_modes text[] not null default '{}',
  note_depth text not null default 'balanced',
  support_style text not null default 'guided',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notes (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id text not null,
  week integer,
  title text not null default '',
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.note_reviews (
  user_id uuid not null references auth.users(id) on delete cascade,
  review_key text not null,
  reviewed_at timestamptz not null,
  note_count integer not null default 0,
  had_course_content boolean not null default false,
  review jsonb not null,
  primary key (user_id, review_key)
);

create table if not exists public.calendar_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  changes jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists notes_user_updated_idx on public.notes(user_id, updated_at desc);

alter table public.profiles enable row level security;
alter table public.notes enable row level security;
alter table public.note_reviews enable row level security;
alter table public.calendar_state enable row level security;

revoke all on public.profiles, public.notes, public.note_reviews, public.calendar_state from anon, authenticated;
grant select, insert, update on public.profiles, public.notes, public.note_reviews, public.calendar_state to authenticated;
grant delete on public.notes, public.note_reviews, public.calendar_state to authenticated;

create policy "profiles_select_own" on public.profiles for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "profiles_insert_own" on public.profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "profiles_update_own" on public.profiles for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "notes_select_own" on public.notes for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "notes_insert_own" on public.notes for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "notes_update_own" on public.notes for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "notes_delete_own" on public.notes for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "reviews_select_own" on public.note_reviews for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "reviews_insert_own" on public.note_reviews for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "reviews_update_own" on public.note_reviews for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "reviews_delete_own" on public.note_reviews for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "calendar_select_own" on public.calendar_state for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "calendar_insert_own" on public.calendar_state for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "calendar_update_own" on public.calendar_state for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "calendar_delete_own" on public.calendar_state for delete to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (
    user_id, full_name, study_level, study_goal, learning_modes, note_depth, support_style
  ) values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'study_level',
    new.raw_user_meta_data ->> 'study_goal',
    array(select jsonb_array_elements_text(coalesce(new.raw_user_meta_data -> 'learning_modes', '[]'::jsonb))),
    coalesce(new.raw_user_meta_data ->> 'note_depth', 'balanced'),
    coalesce(new.raw_user_meta_data ->> 'support_style', 'guided')
  )
  on conflict (user_id) do update set
    full_name = excluded.full_name,
    study_level = excluded.study_level,
    study_goal = excluded.study_goal,
    learning_modes = excluded.learning_modes,
    note_depth = excluded.note_depth,
    support_style = excluded.support_style,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
