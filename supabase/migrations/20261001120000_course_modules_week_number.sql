-- Adds course_modules.week_number: the teaching week a module is named for.
--
-- A generated column, so nothing that writes modules (the scraper, the sync
-- route) has to set it. It reads "Week N" out of `name`, the same pattern the
-- scraper uses (scraper/canvas/render.py: \bweek\s*(\d{1,2})\b, ignoring case),
-- and only accepts 1-20: past that a "week" in a name is something else, like
-- week 52 of a year. A name with no "Week N" leaves it null, and those modules
-- sort by `position`.
--
-- Not unique: a subject can have several modules for the same week, and the
-- app's own placeholder module for a week ('canoka:week:N', named "Week N")
-- sits beside the Canvas module for it.
--
-- Postgres regex: \y is a word boundary (\b means backspace here), and (?i)
-- must come first in the pattern.

begin;

alter table public.course_modules
  add column if not exists week_number smallint
  generated always as (
    case
      when substring(name from '(?i)\yweek\s*(\d{1,2})\y')::int between 1 and 20
        then substring(name from '(?i)\yweek\s*(\d{1,2})\y')::smallint
    end
  ) stored;

create index if not exists idx_course_modules_course_week
  on public.course_modules (course_id, week_number);

commit;
