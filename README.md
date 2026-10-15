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
| Hosting | Netlify (app) + Supabase (managed Postgres) |
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
- Python 3.9+ (only the interpreter: `npm install` sets up the packages)
- A [Supabase]() account
- A Canvas API token (Canvas → Account → Settings → New Access Token)

### Install

```bash
npm install
cp .env.example .env.local
```

`npm install` also creates the Python virtualenv at `.venv` and installs
`scraper/requirements.txt` and `llm/requirements.txt` into it, the same way on
macOS, Windows and Linux. `npm run dev` checks again first and reinstalls only
when a requirements file has changed, so pulling a teammate's new dependency
needs nothing extra.

Neither command ever fails because of Python: they warn and carry on, since
only the local scraper needs it.

- **No Python found.** Install Python 3.9 or later and run `npm run setup:python`.
- **On Debian or Ubuntu,** also run `sudo apt install python3-venv` first.
- **A package won't install** on your platform or Python version (very new
  Python releases often lack builds at first). Everything else still goes
  in, and the warning names what's missing.
- **To use a different Python,** delete `.venv` and run
  `npm run setup:python` with `PYTHON` set to its path.

`npm run setup:python` reinstalls everything and exits non-zero if anything is
missing. Set `SKIP_PYTHON_SETUP=1` to turn off the automatic check. It never
runs in CI, Netlify's builds included, where the scraper is off anyway.

To add a Python dependency, add it to the relevant `requirements.txt` and
commit. Everyone else gets it the next time they run `npm run dev`. The
[Python setup workflow](.github/workflows/python-setup.yml) then checks it
installs on Windows, macOS and Linux.

### Environment variables

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project → Settings → API. Sign-in uses it, in the browser and in `middleware.ts`. It's built into the pages, so set it before building. `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` works instead |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project → Settings → API (server-only, never expose client-side) |
| `ANTHROPIC_API_KEY` | console.anthropic.com. Locally you can save it from Settings → AI instead |
| `TIMETABLE_ICAL_URL` | Optional fallback. Students save their UTS My Timetable link from Settings → Timetable |

Each person signs up at `/sign-up` (Supabase Auth), and the app's pages need
you signed in. The first time an account signs in, it gets its own
`public.users` row (`lib/data/user.ts`), so subjects, notes, the Canvas
connection and reviews are per person. There's no Canvas variable: each person
saves their Canvas address and access token from Settings → Canvas (see below).

## Canvas sync and hosting

The app reads Canvas itself, in TypeScript, so it works the same locally and on
the hosted site (Netlify, which can't run Python):

- **Settings → Canvas** saves the student's Canvas address and access token in
  `canvas_connections`, after checking the token with Canvas.
- **Sync subjects** (`POST /api/canvas/sync`) pulls this session's subjects,
  their modules and weeks, and their assessments into Supabase
  (`lib/canvas/subject.ts`, then `lib/data/subject-sync.ts`). That's a few
  requests per subject. It also notes every file the subjects point at (module
  files, and files linked from pages and briefs).
- **Then Settings reads those files** (`POST /api/canvas/files`, called until
  nothing's left, about 40 seconds a call): PDFs, Word and PowerPoint files,
  speaker notes included (`lib/canvas/files.ts`). Only the text is kept, in
  `canvas_files`. Each file is read once; later syncs skip it.
- **AI review of a week** fetches just that week from Canvas
  (`lib/canvas/week.ts`), adds the text of its files, and saves it as
  `course_content` before reviewing.

This needs the migrations `20261016120000_canvas_connections.sql` and
`20261016130000_accounts_and_canvas_files.sql` in `supabase/migrations/`.
Apply them in the Supabase SQL editor. On Netlify, set the Supabase variables
and `ANTHROPIC_API_KEY` as above; nothing Canvas-specific is needed. In
Supabase → Authentication → URL Configuration, add the site's address (and
`http://localhost:3000`) so sign-up confirmation links come back to the app.

The token is stored as-is in a table with row level security on and no
policies, so only the app's server code can read it. Anyone with access to the
Supabase dashboard can still see it.

## Environments

Every copy of the app (your machine, a teammate's, Netlify's deploy previews and
the live site) runs the same code against the one Supabase project. What
differs is only its settings, and three checks keep those right:

| Check | When | What it catches |
|---|---|---|
| `scripts/check-env.mjs` | Before every `npm run dev` and `npm run build`, Netlify's included. `npm run check:env` by hand | A missing setting, or a key in the wrong place, such as the secret key in a `NEXT_PUBLIC_` setting, which would go to every browser. The command stops and names the setting |
| `/api/health` | Open it on any copy, e.g. `http://localhost:3000/api/health` or `https://canoka.netlify.app/api/health` | Whether the database is reachable, sign-in is built in, AI is on, and which migrations haven't been applied. It shows no keys and no student data |
| The Build workflow | Every pull request, and every push to main | A change that doesn't type-check or build, before it's merged |

- **A new machine:** install Node (the version in `.nvmrc`), run `npm install`,
  copy `.env.example` to `.env.local` and fill it in (the keys are in Supabase
  → Project Settings → API Keys), then run `npm run dev` and sign up.
- **After pulling main:** run `npm install`. If someone added a migration,
  `/api/health` names it; run it once in the Supabase SQL editor, for everyone.
- **Netlify:** the same settings, under Site configuration → Environment
  variables, for all deploy contexts. `NEXT_PUBLIC_` ones are built into the
  pages, so redeploy after changing them. Every pull request gets its own
  deploy preview to try before merging.

## Canvas scraper

Pulls a student's Canvas subjects into a local corpus: one JSON document per
subject for code to query, plus the markdown views you actually put in a
prompt. The app doesn't read this corpus (it syncs from Canvas itself, above).
It's for the scripts in `llm/`, and runs only on your machine: from the
command line, or from Settings → Local scraper while running `npm run dev`,
where it signs in with the Canvas connection saved in Settings.

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
cp scraper/.env.example scraper/.env    # add CANVAS_BASE_URL and CANVAS_TOKEN

cd scraper
../.venv/bin/python scrape.py                       # JSON + markdown views
../.venv/bin/python scrape.py --download --extract  # also convert attachments
../.venv/bin/python week.py 41201 3                 # one week of a subject, from the last scrape
../.venv/bin/python selftest.py                     # no network, no token needed
```

`.venv` comes from `npm install` (see [Install](#install)). On Windows its
Python is `..\.venv\Scripts\python` rather than `../.venv/bin/python`.

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