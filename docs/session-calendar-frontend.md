# Session summary — Calendar frontend + project scaffold

**Date:** 2026-09-04
**Branch:** `mind`
**Goal:** Build the frontend of a calendar view that can be shown as a weekly, monthly, or Kanban view.

---

## 1. Project scaffold (was missing entirely)

The repo previously held only stub `.tsx` files at the root with no build tooling. Added a working Next.js 14 App Router setup:

| File | Purpose |
|---|---|
| `package.json` | Next.js 14.2.5, React 18, TypeScript, Tailwind CSS 3.4, `date-fns` 3 |
| `tsconfig.json` | Strict TS, `@/*` path alias to repo root |
| `tailwind.config.ts` | Content globs for `app/` and `components/` |
| `postcss.config.mjs` | Tailwind + Autoprefixer |
| `next.config.mjs` | Empty baseline config |
| `next-env.d.ts` | Next.js type shim |
| `.gitignore` | `node_modules`, `.next`, env files, etc. |

All existing stub files were moved into `app/` (via `git mv`) so the App Router resolves them:
`app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `app/calendar/`, `app/dashboard/`,
`app/notes/`, `app/settings/`, `app/(auth)/`, `app/api/`.

`app/globals.css` gained base body styling and a thin-scrollbar utility (`.cb-scroll`).

---

## 2. Data model

`types/calendar.ts` defines the shared types:

- **`CalendarEventType`** — `class` | `assessment` | `task`
  - `class` — timetabled session, fixed start/end
  - `assessment` — Canvas assessment task with a `dueDate`; can own subtasks
  - `task` — self-created or AI-generated study task; a subtask is a `task` with a `parentId`
- **`TaskStatus`** — `todo` | `in_progress` | `done` (drives the Kanban board)
- **`Course`** — id, short code, name, colour
- **`CalendarEvent`** — id, title, type, `start`/`end` (ISO), optional `courseId`, `location`,
  `notes`, `status`, `parentId`, `dueDate`
- **`CalendarViewMode`** — `week` | `month` | `kanban`

---

## 3. Mock data

`lib/calendar/mock-data.ts` — all events generated **relative to the current week** so the
calendar always has content in dev. Includes:

- 4 mock courses (DSA, Applications Programming, Discrete Maths, Info Systems)
- 7 classes across the week
- 3 assessments with due dates and statuses
- 4 subtasks belonging to "DSA Assignment 2"
- 4 standalone self / AI study tasks

Swap this module for a Supabase query over `calendar_events` when the backend is ready — the
components take plain `CalendarEvent[]` / `Course[]` props.

---

## 4. Calendar components

| File | Role |
|---|---|
| `app/calendar/page.tsx` | Server page — loads mock data, renders the workspace |
| `components/calendar/CalendarWorkspace.tsx` | Client shell: holds view mode, date anchor, course/type filters, event state (for status changes), and the selected-event detail panel |
| `components/calendar/CalendarToolbar.tsx` | View switcher (Week / Month / Kanban), prev / next / today nav, filter popover for courses and event types |
| `components/calendar/WeekView.tsx` | **Primary view.** Hour-row time grid (7am–10pm), 7 day columns, side-by-side lane layout for overlapping events, red "now" line, assessment due-date flags in the day header, auto-scroll to ~8am |
| `components/calendar/MonthView.tsx` | Month grid (Mon-first), up to 3 events per day + "+N more", click a day number to jump into that week |
| `components/calendar/KanbanView.tsx` | To do / In progress / Done columns, native HTML5 drag-and-drop between columns, overdue highlighting, sorted by due date. Shows assessments + tasks only (classes have no status) |
| `components/calendar/EventDetail.tsx` | Right-hand slide-over: when, course, location, due date, notes, parent assessment link, status toggle buttons, and an interactive subtask checklist. Tasks and AI-generated subtasks have an inline date / start-time / end-time editor so a student can reschedule them to fit their week; classes and assessment due dates stay read-only |
| `lib/calendar/colors.ts` | Per-course colour classes (static strings so Tailwind JIT picks them up) |
| `lib/calendar/event-utils.ts` | Date helpers, day/week filtering, pixel placement in the time grid, overlap lane assignment, status metadata, formatting |

### Cross-view interactions

- Switching views preserves the current date anchor
- Month view → click a day → opens that week
- Any event → click → opens the detail slide-over
- Detail panel status buttons and Kanban drag both update the same event state, so changes are reflected across every view
- Toolbar filters (hide a course or an event type) apply to all three views

---

## 5. Verification

- `npx tsc --noEmit` — passes, no type errors
- `npm run build` — compiles successfully; `/calendar` prerenders as static (~12 kB, 99 kB first load JS)
- Dev-server smoke test — `GET /calendar` → 200, mock events and all three view labels present in the HTML

---

## 6. How to run

```bash
npm install
npm run dev
# open http://localhost:3000/calendar
```

---

## 7. Not done / next steps

- Wire `calendar_events` from Supabase in place of the mock module (define the table + RLS,
  add the query in `app/calendar/page.tsx`)
- Persist status changes (currently client-only local state)
- External calendar subscription + Canvas assessment sync (see `app/api/calendar/sync/`, `app/api/canvas/sync/`)
- Day view, event creation / editing UI
- App-wide navigation shell (sidebar linking dashboard / notes / calendar / settings)
- Nothing from this session has been committed yet
