# Progress summary

**Date:** 2026-09-12
**Branch:** `Mind`

A living snapshot of what's actually built in canvasbuddy (Canoka) versus
what the [README](../README.md) describes, plus the key features of what's
been implemented so far. Update this file whenever a feature moves from stub
to built, rather than trusting the README alone to reflect reality.

---

## 1. Feature status vs the README

| Feature | README says | Status |
|---|---|---|
| **Calendar** | UTS + external calendars, Canvas assessments, classes/assessments/tasks, subtasks | **Built** (frontend, on scraped Canvas data) |
| **Dashboard** | Notifications, "due this week", quick links into notes | **Built** (frontend, on scraped Canvas data) |
| **Notes** | Canvas content → AI notes, per-subject/per-week, word-editor view | Stub page only |
| **Settings** | Canvas connection, calendar subscriptions, preferences | Stub page only |
| **Sign up** | Single-role (student) auth | Stub page only |
| **Supabase (DB + Auth)** | Postgres, Auth, RLS, Storage | Not started — no dependency, no `lib/supabase/`, no migrations |
| **Canvas integration** (`lib/canvas`) | REST API wrapper | Not started |
| **AI integration** (`lib/ai`) | Note generation | Not started |

Nothing is wired to a real backend yet. Calendar and Dashboard both read the
subjects and assessments from the Canvas scraper's last run
(`lib/scraper/calendar.ts`, reading `scraper/out`), so they're empty until the
scraper has run on the machine serving the app. Calendar edits are kept in the
browser's localStorage only (see section 4).

---

## 2. Design system

The app's visual language comes from a design-system CSS handoff, implemented
as three layered stylesheets under `styles/`, imported once in
`app/layout.tsx` (after Tailwind, so its tokens win where they overlap):

- **`variables.css`** — the canonical design tokens (colour, type scale,
  spacing, radii, breakpoints). Untouched from the handoff — change values
  here to re-theme the whole app.
- **`styles.css`** — the shared component classes from the handoff
  (`.card`, `.badge`, `.btn-*`, `.sidebar`/`.nav-link`, `.calendar-*`,
  `.kanban-*`, etc.), also untouched.
- **`calendar-extra.css`** / **`dashboard-extra.css`** — app-specific
  additions layered on top for things the handoff didn't cover (the hour-grid
  in Week view, the nested sidebar sub-nav, dashboard notification rows).
  These only ever reference `variables.css` tokens — no new hex values.

Body typeface is **DM Sans** and headings use **Space Grotesk**, both loaded
via `next/font/google` and exposed as `--font-dm-sans` and
`--font-space-grotesk`, which `variables.css`'s `--font-body` and
`--font-heading` point at. Tailwind is still installed and used for one-off layout utilities that
don't collide with the handoff's class names (e.g. `truncate`, `min-h-0`);
anything that would collide (`.card`, `.container`, `.grid`, …) uses the
handoff's version instead.

Course colours (`lib/calendar/colors.ts`) map subjects, in subject-code order,
onto the palette's existing semantic tokens (info / accent / success /
secondary, then error and accent-muted) rather than inventing new colours.

---

## 3. App shell

`components/shell/Sidebar.tsx` is the shared navigation shell used by every
built page: **Dashboard, Notes, Calendar, Settings**, each highlighted via an
explicit `active` prop. On the Calendar page only, it also renders a nested
Week / Month / Kanban sub-nav that drives the calendar's view state directly
(no routing involved — it's client state in `CalendarWorkspace`).

Icons (`components/shell/icons.tsx`) are small hand-written inline SVGs —
no icon library dependency.

---

## 4. Calendar (`/calendar`)

`components/calendar/CalendarWorkspace.tsx` composes:

- **Sidebar** — view switcher (Week / Month / Kanban).
- **CalendarToolbar** — centred period title (`Week 37`, `September`, or
  `Kanban Board`) with prev/today/next nav, plus three always-visible source
  toggles that map to the README's three object types:
  - ◆ **University Timetable** → `class`
  - ◆ **Assessment Schedule** → `assessment`
  - ● **Personal Calendar** → `task`

  A compact "Courses" popover still allows filtering by individual course.
- **WeekView** — the primary view: an hour-by-hour time grid (7am–10pm), 7
  day columns, side-by-side lanes for overlapping events, a live "now" line,
  and assessment due-date flags in the day header. Assessments are deadlines,
  not blocks of time, so they only appear as those flags; the grid holds
  classes and tasks.
- **MonthView** — Monday-first month grid, up to 3 events per day + "N more",
  click a day to jump into that week.
- **KanbanView** — starts with four columns (`Coming Up`, `Not Started`,
  `In Progress`, `Completed`). Students can add, rename and delete columns;
  each column counts as one of those four statuses (every status keeps at
  least one column), so week/month views keep reading `status`. Cards drag
  between and within columns, and "Add a card" creates a task booked for the
  next hour so it also shows in the calendar. Only assessments and tasks
  appear here — classes have no status.
- **CardEditor** — one editor for assessments and tasks, used in two places
  so a card reads and edits the same everywhere: the Kanban board's modal
  (`KanbanCardModal`, two columns) and the week/month right-hand slide-over
  (`EventDetail`, one column). It covers column, priority, notes, checklist,
  labels and the subtask list (tick off, open, or re-time each subtask), and
  for tasks also title, subject, due date, calendar time and delete.
  Assessment title/subject/dates stay read-only (Canvas-owned). Classes have
  no card, so `EventDetail` shows them as a read-only summary.

Status changes, reschedules, new tasks, card details and board columns are
saved to this browser's localStorage (`lib/calendar/storage.ts`, key
`canoka.calendar.v2`) until Supabase replaces it. Only the changes are saved
and they are laid over the scraped assessments on load, so a new scrape's due
dates and assessments still come through. v1 saved whole events from the
mock-data days; on first load only the student's own tasks and board carry
over. The dashboard reads the scraped data directly, so it doesn't see those
edits.

### Where the data comes from

`lib/scraper/calendar.ts` turns `scraper/out` into the calendar's courses and
events, read fresh on every request:

- **Courses** — one per subject in `index.json`, keyed by Canvas course id
  (the same id notes are saved against).
- **Assessments** — every published assessment, id `canvas-<assignment id>` so
  edits survive re-scrapes. Due date from Canvas `due_at`; status `done` once
  the submission is submitted or graded, otherwise `coming_up`. An assessment
  Canvas gives no due date (all of 41052's, for instance) has no `start`/`end`:
  it's on the Kanban board, sorted last, but not the week or month view.
- **Classes** — none. Canvas has no timetable; that waits on the iCal sync
  (`/api/calendar/sync`).

---

## 5. Dashboard (`/dashboard`)

`components/dashboard/DashboardContent.tsx` deliberately implements *only*
what the README assigns the dashboard — no stats, streaks, or quiz widgets,
even though an earlier UI mockup for this page included them:

- **Due this week** — assessments due within the current calendar week,
  sorted by date, each tagged "Due today" / "Overdue" / "in N days".
- **Notifications** — assessments overdue or due within 48 hours.
- **Your subjects** — one chip per course, linking into `/notes`.

All derived live from the same scraped data (`lib/scraper/calendar.ts`) as
the Calendar page, so the two stay consistent with each other.

---

## 6. Not done / next steps

Roughly the order a backend pass would tackle them:

1. Stand up Supabase — schema, RLS, `lib/supabase/` clients, `.env.example`.
2. Wire `calendar_events` from Supabase in place of the scraper's files; persist
   status changes and reschedules.
3. Build `lib/canvas/` and implement the `canvas/sync`, `notes/generate`,
   `calendar/sync` API routes (currently all return `501`).
4. Build `lib/ai/` plus the notes-generation pipeline and the
   word-editor-style notes UI.
5. Build Settings (Canvas connection, calendar subscriptions, preferences).
6. Wire Supabase Auth for sign-up.
7. Add a day view and event creation/editing UI to the calendar.
8. Delete the stray empty scaffold directories left at the repo root from
   before files were moved into `app/`.

---

## 7. Running it locally

```bash
npm install
npm run dev
# http://localhost:3000/dashboard
# http://localhost:3000/calendar
```

Node.js was not preinstalled on this machine; it was added via
`winget install --id OpenJS.NodeJS.LTS`. A fresh Git Bash shell may need
`export PATH="/c/Program Files/nodejs:$PATH"` before `node`/`npm` resolve.
