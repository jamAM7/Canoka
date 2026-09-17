# Subtask pipeline setup

Covers the new Canvas → Supabase → Claude subtask pipeline, and wiring the
calendar to real data instead of `mock-data.ts`.

We share one Supabase project, so the schema changes, migrations, and dev
user below are **already applied** — nothing to run again. This section is
just for reference/debugging.

<details>
<summary>Reference: migrations + dev user already applied to our project</summary>

```sql
-- study_tasks ordering + indexes
alter table study_tasks add column order_index integer;
create index if not exists study_tasks_assignment_id_idx on study_tasks(assignment_id);
create unique index if not exists study_plans_user_course_active_idx
  on study_plans(user_id, name) where status = 'active';

-- unique constraints for upserts
alter table courses add constraint courses_institution_external_unique
  unique (institution_id, external_course_id);
alter table assignments add constraint assignments_course_external_unique
  unique (course_id, external_assignment_id);

-- temporary dev-only open RLS (no auth yet — see note below)
create policy "dev read all study tasks" on study_tasks for select using (true);
create policy "dev read all courses" on courses for select using (true);
create policy "dev read all course_enrolments" on course_enrolments for select using (true);
create policy "dev read all assignments" on assignments for select using (true);

-- dummy dev user (no sign-up flow yet)
insert into users (email, full_name) values ('dev-test@localhost', 'Dev Test User');
```

**⚠️ The open RLS policies must be reverted before real user data goes into
this database** — right now anyone with the anon key can read every row in
these four tables.

</details>

## 1. Environment variables

Ask for the shared values (Supabase URL/keys, dev user id, Claude API key)
rather than generating your own — we're all pointing at the same project.

**`.env.local`** (Next.js frontend):
```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

**`.env`** (repo root — used by the Python scripts):
```dotenv
SUPABASE_URL=                # same value as NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY=   # same value as in .env.local
SUPABASE_USER_ID=            # shared dev user UUID — ask, don't create a new one
CANVAS_BASE_URL=https://canvas.uts.edu.au
ANTHROPIC_API_KEY=           # your own key, from console.anthropic.com
```

> Both `sync_to_supabase.py` and `generate_subtasks.py` load the root `.env`
> explicitly (`load_dotenv(Path(__file__).resolve().parent.parent / ".env")`)
> rather than bare `load_dotenv()` — avoids picking up `scraper/.env` first
> and never reaching the root file.

## 2. Install dependencies

**Python** (inside your venv, from repo root):
```powershell
pip install -r llm\requirements.txt
```

**Node:**
```powershell
npm install
```

## 3. Running the pipeline (optional — only if testing the Python side)

```powershell
python scraper\sync_to_supabase.py scraper\out\<subject-file>.json
python llm\generate_subtasks.py
```

Both are idempotent — safe to rerun without duplicating data. Since we
share one database, running this will affect what everyone sees, so check
before regenerating subtasks for an assignment someone else is looking at.

## 4. Frontend

`app/calendar/page.tsx` is now an async Server Component pulling from
`lib/calendar/supabase-events.ts` instead of `mock-data.ts`.

**Known limitation:** the user id is hardcoded (`DEV_USER_ID` in
`page.tsx`) — no login flow yet.

**Clear stale localStorage if you don't see the real data:**
`CalendarWorkspace` restores from `localStorage` (`canoka.calendar.v1`) on
mount, which overrides fresh server data if you've used the calendar with
mock data before. Clear via dev tools → Application/Storage → Local
Storage, or run `localStorage.removeItem("canoka.calendar.v1")` in console.

## What's real vs. not, for demo purposes

| Piece | Status |
|---|---|
| Course enrolment | Real — synced from scraped Canvas data |
| Assignment data | Real — pulled from Canvas via the scraper |
| Subtask generation | Real — live Claude API call per assignment |
| Calendar display | Real — queries Supabase directly |
| Auth / login | **Not built** — hardcoded dev user throughout |
| Pipeline trigger | **Manual** — run via Python scripts, not automatic |