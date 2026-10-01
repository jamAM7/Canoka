-- Merges duplicate week modules: where a subject has both a real Canvas module
-- and a synthetic placeholder ('canoka:week:N', named "Week N") for the same
-- week, moves everything on the placeholder to the real module, then deletes
-- the placeholder.
--
-- The first sync made a placeholder for every teaching week, even where Canvas
-- already had a module named "Week N". The sync and the app now give each week
-- one module (the real one if there is one, else the placeholder) and read by
-- week_number, so this only tidies what the first sync left. Weeks with no
-- real module keep their placeholder.
--
-- Which real module wins when a week has several: the lowest position (no
-- position last), then the oldest, then the lowest id. The same rule as
-- groupWeeks() in lib/notes/weeks.ts: change one, change the other.
--
-- Order matters. Notes, content and reviews are repointed BEFORE the delete:
-- deleting a module sets notes.module_id and course_content.module_id to null,
-- and cascades to week_reviews, so deleting first would lose them.
--
-- Moving a note changes its updated_at (the set_updated_at trigger, left on
-- deliberately), so the notes list's "newest edit first" order shuffles once.
-- Notes' content is untouched, so nothing is added to note_versions.
--
-- Apply AFTER migrations 20261001120000 (week_number) and 20261001120100
-- (week_reviews), and after deploying the code that no longer creates the
-- placeholders: the old sync would make them again on the next scrape.
-- Safe to run again: with nothing left to merge it changes nothing.
--
-- To see what it will do first, read-only:
--
--   select s.course_id, s.week_number, s.id as placeholder_id, r.external_module_id as real_module,
--          (select count(*) from notes n where n.module_id = s.id) as notes,
--          (select count(*) from course_content c where c.module_id = s.id) as content
--   from course_modules s
--   join course_modules r on r.course_id = s.course_id and r.week_number = s.week_number
--    and r.external_module_id not like 'canoka:week:%'
--   where s.external_module_id like 'canoka:week:%'
--   order by 1, 2;

begin;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'course_modules' and column_name = 'week_number'
  ) then
    raise exception 'Apply 20261001120000_course_modules_week_number.sql first.';
  end if;
  if to_regclass('public.week_reviews') is null then
    raise exception 'Apply 20261001120100_week_reviews.sql first: its rows have to be moved too.';
  end if;
end
$$;

create temp table week_module_merge on commit drop as
select s.id as placeholder_id,
       (select r.id
          from public.course_modules r
         where r.course_id = s.course_id
           and r.week_number = s.week_number
           and r.external_module_id not like 'canoka:week:%'
         order by r.position nulls last, r.created_at, r.id
         limit 1) as real_id
  from public.course_modules s
 where s.external_module_id like 'canoka:week:%'
   and s.week_number is not null;

-- A week with no real module keeps its placeholder.
delete from week_module_merge where real_id is null;

update public.notes n
   set module_id = m.real_id
  from week_module_merge m
 where n.module_id = m.placeholder_id;

update public.course_content c
   set module_id = m.real_id
  from week_module_merge m
 where c.module_id = m.placeholder_id;

update public.week_reviews w
   set module_id = m.real_id
  from week_module_merge m
 where w.module_id = m.placeholder_id;

delete from public.course_modules d
 using week_module_merge m
 where d.id = m.placeholder_id;

select count(*) as placeholders_merged from week_module_merge;

commit;
