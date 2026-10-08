-- DROPS THE FOUR TEMPORARY "dev read all" POLICIES. Apply this one last.
--
-- They were added so the first calendar prototype could read with the public
-- anon key before the app had a server-side client. Each one lets anyone with
-- the anon key (it ships to every browser) read EVERY row of its table:
--
--   courses, course_enrolments, assignments, study_tasks
--
-- The app now reads and writes through server route handlers with the service
-- role key, which bypasses RLS, so it doesn't need them. With the policies
-- gone those tables, like all the others, have RLS enabled and no policies:
-- the anon key reads nothing.
--
-- Before applying, check nothing still reads these tables with the anon key.
-- The calendar code on origin/feature/supabase-subtask-pipeline does
-- (lib/supabase/server.ts uses the anon key) and will return no rows after
-- this. The Python scripts use the service role key and are not affected.
--
-- Note the last policy's name really is "dev read all study tasks", with a space.

begin;

drop policy if exists "dev read all courses"            on public.courses;
drop policy if exists "dev read all course_enrolments"  on public.course_enrolments;
drop policy if exists "dev read all assignments"        on public.assignments;
drop policy if exists "dev read all study tasks"        on public.study_tasks;

commit;
