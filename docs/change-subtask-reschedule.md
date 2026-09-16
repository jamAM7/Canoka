# Change summary — Editable subtask date & time

**Date:** 2026-09-08
**Branch:** `mind`
**Goal:** Let a student move an assessment's generated subtasks to a different date/time so they fit their own schedule. Classes and assessment due dates remain fixed.

---

## 1. Behaviour added

- Every **task** and every **AI-generated subtask** now has an inline editor with:
  - a date picker (`<input type="date">`)
  - a start-time picker and an end-time picker (`<input type="time">`)
- Editors appear in two places in the right-hand detail slide-over:
  - the **"When"** section when a task/subtask is opened directly
  - a compact row under **each subtask** in an assessment's subtask list, so all of an assessment's subtasks can be re-timed without leaving the assessment
- Subtask titles in the list are now clickable and open that subtask's own detail panel; the "Part of" link opens the parent assessment.
- Edits write to the shared event state, so a moved subtask immediately shifts in the **week**, **month**, and **Kanban** views.

## 2. What stays read-only

| Type | Editable? | Why |
|---|---|---|
| `task` / subtask | ✅ Yes | Student-owned scheduling |
| `class` | ❌ No | Timetabled session |
| `assessment` due date | ❌ No | Comes from Canvas |

(Guarded by `canEditSchedule(ev)` → `ev.type === "task"` in `EventDetail.tsx`; loosen this if assessments should become editable too.)

---

## 3. Files changed

| File | Change |
|---|---|
| `lib/calendar/event-utils.ts` | New `rescheduleEvent(event, { date?, startTime?, endTime? })` helper. Accepts native date/time input strings (`yyyy-MM-dd`, `HH:mm`), returns new ISO `start`/`end`. Any omitted field keeps its current value. If the new end is not after the new start, the original duration is preserved — editing only the start time shifts the block instead of collapsing it. Added `addMinutes`, `parse`, `set` imports from `date-fns`. |
| `components/calendar/CalendarWorkspace.tsx` | New `reschedule(id, start, end)` handler that patches event state; passed to `EventDetail` as `onReschedule`. Also passes `onSelect` so the panel can navigate between an assessment and its subtasks. |
| `components/calendar/EventDetail.tsx` | New `ScheduleEditor` sub-component (full + `compact` variants). "When" section renders the editor for editable events, static text otherwise. Subtask list rows gained a clickable title and an inline `ScheduleEditor`. "Part of" parent link is now a button. New props: `onReschedule`, `onSelect`. |
| `docs/session-calendar-frontend.md` | Updated the `EventDetail.tsx` row to mention subtask rescheduling. |

---

## 4. Verification

- `npx tsc --noEmit` — passes
- `npm run build` — compiles; `/calendar` prerenders (~17 kB, 104 kB first load JS)
- Dev-server check — `GET /calendar` → 200

---

## 5. Known limitation / next step

Rescheduling is **client-only local state** (same as status changes) — edits reset on page reload. Persisting requires the Supabase `calendar_events` update path:

- `PATCH` route or server action that writes `start` / `end` for an event id
- call it from `CalendarWorkspace.reschedule` (optimistic update + revalidate)
- add RLS so a student can only edit their own tasks
