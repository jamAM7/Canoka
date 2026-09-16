# canvasbuddy

A student app that syncs Canvas into one place: AI-generated notes and calendar

## Overview

Canoka pulls course content and deadlines from Canvas, turns them into organised per-subject/per-week notes and surfaces everything on a home dashboard.

## Core features

| Feature | Summary |
|---|---|
| **Notes** | Canvas content → AI-generated notes, organised per-subject / per-week, editable in a word-editor-style view |
| **Calendar** | Subscribes to UTS + external calendars; pulls assessments from Canvas; three object types — classes, assessment tasks, self/AI tasks; assessments auto-break into subtasks |
| **Dashboard** | Notifications, "due this week", quick links into notes |
| **Settings** | Canvas connection, calendar subscriptions, preferences |
| **Sign up** | Single-role (student) auth for MVP |

## Tech stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 14** (App Router, TypeScript) |
| Styling | Tailwind CSS |
| Database + Auth | **Supabase** (Postgres, Auth, Row Level Security, Storage) |
| Hosting | Vercel (app) + Supabase (managed Postgres) |
| AI | Pluggable via `lib/ai` — used for note generation |
| Canvas integration | Canvas LMS REST API via `lib/canvas` |

## Repo structure

```
.
├── app/                        # Next.js App Router
│   ├── (auth)/sign-up/         # Sign up page
│   ├── dashboard/              # Home dashboard
│   ├── notes/                  # Notes: subject list -> week detail
│   │   └── [subjectId]/[weekId]/
│   ├── calendar/               # Calendar view
│   ├── settings/                
│   └── api/                    # Backend logic (Route Handlers)
│       ├── canvas/sync/        # Pull courses/assignments from Canvas
│       ├── notes/generate/     # Canvas content -> AI notes
│       └── calendar/sync/      # External calendar subscriptions
├── components/                 # Shared UI, grouped by feature
├── lib/
│   ├── supabase/                # Browser + server Supabase clients
│   ├── canvas/                  # Canvas API wrapper
│   └── ai/                      # AI provider wrapper (notes/quiz generation)
├── styles/                      # Global stylesheets imported by app/layout.tsx
├── types/                       # Shared TypeScript types
├── scraper/                     # Python: Canvas -> JSON + markdown corpus (see below)
├── llm/                         # Python: assessment -> subtasks via the Claude API (see below)
├── supabase/
│   ├── migrations/               # SQL schema, source of truth for the DB
│   └── seed.sql
└── docs/
    ├── architecture.md
    ├── er-diagram.md
    ├── data-flow-canvas-sync.md
    └── mvp-scope.md
```

## Getting started

### Prerequisites
- Node.js 20+
- A [Supabase]() account
- A Canvas API token (Canvas → Account → Settings → New Access Token)

### Install

```bash
npm install
cp .env.example .env.local
```

### Environment variables

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project → Settings → API (server-only, never expose client-side) |
| `CANVAS_BASE_URL` | Your institution's Canvas URL, e.g. `https://canvas.uts.edu.au` |
| `CANVAS_API_TOKEN` | Canvas → Account → Settings → New Access Token |
| `AI_API_KEY` | Your AI provider's API key |

## Canvas scraper

Pulls a student's Canvas subjects into a local corpus: one JSON document per
subject for code to query, plus the markdown views you actually put in a
prompt.

```
scraper/out/
  index.json                                # every subject, its views, coverage gaps
  41201-....json                            # the queryable document
  41201-....md                              # subject overview, for a prompt
  41201-....week-3-systems-thinking.md      # one per module, for a prompt
  files/41201-.../13473995_Tutorial 7.pdf   # with --download
  files/41201-.../13473995_Tutorial 7.md    # with --extract
```

A whole subject is roughly 100k tokens of JSON. The module view for the week
being asked about is roughly 1k. Only the second belongs in a request.

```bash
python3 -m venv .venv
.venv/bin/pip install -r scraper/requirements.txt
cp scraper/.env.example scraper/.env    # add CANVAS_BASE_URL and CANVAS_API_TOKEN

cd scraper
../.venv/bin/python scrape.py                       # JSON + markdown views
../.venv/bin/python scrape.py --download --extract  # also convert attachments
../.venv/bin/python selftest.py                     # no network, no token needed
```

On Windows the venv puts things elsewhere, but nothing else changes:

```
py -m venv .venv
.venv\Scripts\pip install -r scraper\requirements.txt
```

The requirements file installs correctly on every platform without editing.
[scraper/README.md](scraper/README.md) covers why, along with the document
schema, the markdown views, attachment conversion, coverage reporting, and
every flag.

Read `out/index.json` for the subject list. Each entry names its JSON document
and its `views`, in filename order: the subject overview first, then one per
module. Load the view you need and send that, not the JSON. The views render
deterministically, with no timestamps and no set iteration, so the same module
produces the same bytes every run. That is what makes them safe to sit behind a
prompt-cache breakpoint.

## LLM subtask generation

`llm/generate_subtasks.py` reads a subject JSON from `scraper/out/` and asks
Claude to break an assessment into ordered subtasks, written to
`llm/test_output.json`. See [llm/README.md](llm/README.md) for setup.