# SIS — Canvas subject scraper

Pulls every subject the token owner is enrolled in and writes, per subject, one
self-contained JSON document plus the markdown views you actually put in a
prompt.

The JSON is the storage layer: code queries it to pick a module, resolve a page
pointer, drop template filler. The markdown is the prompt layer. A whole subject
is ~100k tokens of JSON; the module view for the week being asked about is ~1k.

## Setup

```bash
cd SIS
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# edit .env — put your Canvas host and a freshly generated token in it
```

`.env` is gitignored. Keep it that way.

## Run

```bash
python scrape.py                        # active subjects, links only
python scrape.py --download --extract   # also pull files and convert them to .md
python scrape.py --include-concluded    # past sessions too
python scrape.py --session 'Autumn 2026'  # a specific session
python scrape.py --all-sessions         # every session you're enrolled in
python scrape.py --courses 41052 41201  # only these subject codes
python scrape.py --ocr                  # also OCR scanned PDFs (macOS)
python scrape.py --drop-boilerplate     # remove UTS template pages
python scrape.py --pretty               # indent the JSON for reading
python scrape.py --no-render            # JSON only, skip the markdown views
python scrape.py --refresh              # ignore the local response cache
```

By default only the **current session** is scraped, and courses with no
subject code (induction modules, academic integrity, org sites) are skipped.
The chosen session is printed so it isn't silent — override with `--session`,
or turn both filters off with `--all-sessions` and `--include-non-subjects`.
Naming subjects explicitly with `--courses` bypasses the filtering entirely.

Output lands in `out/`:

```
out/
  index.json                       # every subject, its views, gaps, session choice
  41052-advanced-algorithms.json   # the queryable document
  41052-advanced-algorithms.md     # subject overview, for a prompt
  41052-advanced-algorithms.week-3-....md   # one per module, for a prompt
  files/41052-advanced-algorithms/ # only with --download
    13473995_Tutorial 7.pdf        # the original
    13473995_Tutorial 7.md         # converted, only with --extract
```

Raw API responses are cached in `.cache/` with a lifetime per endpoint, so
re-running is fast without going stale: announcements, assignments and
submissions expire after an hour, pages and modules after a week, and file
metadata never (Canvas issues a new id when a file changes). `--refresh`
ignores the cache entirely.
Downloaded files are skipped when a local copy already matches the size Canvas
reports, so a re-run with `--download --extract` costs seconds rather than
pulling the whole course library again.

## What each subject file contains

| Key | What's in it |
| --- | --- |
| `subject` | code, name, session, teachers, syllabus as markdown |
| `assessments` | weight, due dates (incl. section overrides), full brief, rubric, links, attachment ids, your submission, and `content_status` saying why a brief or rubric is empty |
| `quizzes` | question count, time limit, attempts, description |
| `modules` | week structure; items point at their page via `page_url` + `resolved` |
| `pages` | every page body as markdown, with its attachments resolved and extracted |
| `announcements` / `discussions` | posts as markdown |
| `external_tools` | Echo360, Turnitin and friends |
| `files` | every file seen anywhere, including ones only reachable through a link when the Files tab is hidden; with `--extract`, its text and the path to its converted `.md` |
| `links` | one deduped index of every link found anywhere, with its source; the per-item `links` lists are bare URLs into it |
| `overview_markdown` | generated summary — assessment table, module list, gaps |
| `_meta` | fetch time, grading rule used, coverage |

All text fields are markdown inside JSON strings, so headings and tables
survive. Marking criteria are nearly always tables.

## The markdown views

`render.py` turns a document into the markdown a prompt gets. One file per
module, plus a subject overview. Rendering resolves each module item's
`page_url` into the page body, drops pages flagged as boilerplate, pulls in the
assessments that module is about, and renders marking criteria as a table
instead of a nested array of rating bands. `content_status`, `all_dates`,
`tabs`, the link index and the coverage counters don't appear — a model reads
none of them.

Two details that matter downstream. Inlined page headings are pushed below the
headings around them, so a page's own `## Overview` doesn't read as a sibling of
the module. And the output is deterministic — no timestamps, no set iteration —
because these strings are meant to sit behind a prompt-cache breakpoint, where
one changed byte costs you the entry.

Which assessments belong to a module is decided by the module items that name
them, falling back to a shared week number. No single signal covers every
subject: 41201 numbers its modules, 41028 numbers some, 41129 numbers
assessments but not modules, and 41052 numbers nothing.

## Attachments become markdown

`--extract` converts every downloaded attachment and writes it as its own `.md`
beside the original, named from the same file id.

PDFs go through **pymupdf4llm**, which infers heading levels from font size and
emits real pipe tables. That matters more for this format than any other: tutorial
sheets and marking criteria live in PDFs *as tables*, and flat text extraction
turns a weighted decision matrix into a run of numbers with the columns gone. If
pymupdf4llm isn't installed the scraper falls back to `pypdf` and records
`extractor: "pypdf"` on the file, so a rubric that came back as prose is
traceable rather than mysterious. `.pptx`, `.docx`, `.xlsx` and the plain-text
formats keep their existing extractors.

A converted file is written once. Byte-identical re-uploads are detected by
`sha256` and marked `duplicate_of`, so staff shipping the same reading as `(1)`
and `(2)-1` costs one conversion, not three. A file that arrived as `.md`
already is left alone rather than overwritten with a copy of itself.

In a module view, a short attachment is inlined with its headings demoted into
place — not blockquoted, since `> ` in front of a pipe table destroys the table
the conversion just preserved. Anything past `INLINE_LIMIT` is named with the
path to its `.md` instead, because a module slice is meant to be the ~1k tokens
the question is about, not a week of readings.

## Keeping the JSON worth its tokens

These stop the files filling with text that costs context and returns nothing:

**Pages are stored once.** Module items carry `page_url` and `resolved` rather
than a second copy of the body — inlining doubled every page. Resolve a pointer
by looking its slug up in `pages[]`; `resolved: false` means the item names a
page that wasn't retrieved.

**Files are stored once.** Briefs and pages carry attachment *ids*; the records
live in `files[]`. The same PDF is routinely linked from several pages, and
inlining the record copied its metadata — and, with `--extract`, its whole
extracted text — once per reference.

**Links are stored once.** `links[]` holds the full record with its label, kind
and sources. The per-item `links` lists are bare URLs into it, rather than a
second copy of every field.

**Verifier tokens are stripped.** Canvas appends `?verifier=<token>` to file
links: a bearer credential that downloads the file with no auth at all. They
were ~230 per subject, they cost tokens, and they had no business being written
to disk or pasted into a model provider's logs. Other query params survive.

**Identical files are extracted once.** Staff re-upload the same document as
`(1)`, `(2)-1` and so on. Files with matching `sha256` get `duplicate_of`
pointing at the first copy, and only that copy carries the text.

**Template pages are flagged.** UTS ships the same filler into every subject
shell. They're detected by body, not title — URLs stripped first, since Canvas
rewrites them per course — because titles lie: `Assessment overview` repeats
across subjects too, and in 41052 it is the only place the weights and dates
exist. Matching pages get `boilerplate: true`, so you can filter at prompt time.
`--drop-boilerplate` removes them instead, and any module item that named one
then reads `resolved: false`.

**Scanned PDFs can be OCR'd.** `--ocr` renders pages that have no text layer and
runs them through the macOS Vision recogniser — pip-only, no Homebrew. Recovered
text is marked `"extractor": "macos-vision-ocr"`. Off by default because it is
slow and macOS-only.

Spreadsheets are dumped in full, deliberately: every row stays queryable from
the JSON rather than needing the file opened.

## Which session gets scraped

By default the scraper picks the term whose date window contains right now, and
records the evidence in `index.json` under `session_selection`:

```json
{"name": "Spring 2026 (City campus)", "basis": "term_dates",
 "start_at": "2026-07-19T14:00:00+00:00", "end_at": "2027-01-04T13:00:00+00:00",
 "as_of": "2026-09-03T11:26:51+00:00", "verified": true}
```

`basis` says how the choice was made, which matters because the three cases are
not equally trustworthy:

- **`term_dates`** — a term's window contains now. `verified: true`. The normal case.
- **`name_majority`** — no term published any dates, so the term shared by most of
  your subjects wins. `verified: false`, and the run prints a warning, because a
  corpus built from a guess shouldn't look like one built from a check.
- **`explicit`** — you passed `--session`. Honoured either way, but still checked
  against the clock and marked unverified if today falls outside it.

If the terms *do* have dates and none of them contain today, you're between
sessions. The run stops with a non-zero exit rather than quietly scraping the
term that happens to be nearest — `--session` or `--all-sessions` overrides it.

## Two things that stop the output being quietly wrong

**Grading rule.** Canvas has two ways of turning points into a final mark. If
`apply_assignment_group_weights` is on, group weights are authoritative and
assignments split their group's weight by points. If it's off, weight is just
points over the course total. The rule actually used is recorded in
`_meta.grading_rule`.

**Disabled Pages index.** Staff can switch off the Pages tab while leaving
individual pages readable. When the index 403s, the scraper falls back to the
page slugs named by module items and fetches them one at a time. Coverage is
marked `partial` rather than `ok`, with a note saying how many were recovered.

**Empty briefs and rubrics.** Some subjects use Canvas assignments as bare
gradebook columns (`submission_types: ["none"]`, no description, no rubric) and
keep the real brief in Ed or the subject outline LTI. `/assignments` still
returns 200, so endpoint-level coverage can't see it — an empty `brief` looks
the same whether Canvas held nothing or we failed to read it. Every assessment
therefore carries a `content_status`:

```json
"content_status": {
  "brief": "absent_in_canvas", "rubric": "absent_in_canvas",
  "gradebook_placeholder": true,
  "likely_source": ["Ed (the assignment name is prefixed [ed])",
                    "the subject outline / Subject Information LTI"]
}
```

rolled up into `_meta.coverage.assessment_content` and stated in prose at the
top of `overview_markdown`. Note that `/courses/:id/rubrics` is teacher-only —
a student token gets 403 — so a rubric attached at course level rather than to
the assignment is unreadable, and the note says so rather than implying there
is none.

**Coverage.** If a lecturer hides the Files tab, that endpoint 403s. Rather than
dying or silently emitting an empty list, `_meta.coverage` records what was
attempted and what came back, so "this subject has no readings" stays
distinguishable from "we couldn't read them". Files linked from briefs and
pages are still reachable one at a time, so `files[]` is built from everything
seen anywhere rather than from the listing alone — 41201 surfaces 57 files that
way while its Files tab 403s. Coverage then reads `partial`, with a note saying
this is what's reachable rather than everything the subject has. `overview_markdown` names the
gaps in prose too. Statuses are `ok`, `partial` (recovered by a fallback, with a
note saying how), `forbidden` (403 — hidden or restricted), `disabled` (staff
switched the tab off, which is a fact about the subject rather than a failure to
read it) and `error` (anything genuinely unexpected, with the message).

## Limits

- Text extraction is blind to diagrams, figures and equations rendered as
  images. On lecture slides that can be most of the meaning — treat the
  extracted text as a searchable index, not a replacement for the file.
- Scanned PDFs have no text layer. They're flagged as such unless you pass
  `--ocr`, which is macOS-only and adds a minute or so per scanned file.
- LTI tools (Ed, Turnitin, the UTS subject outline) sit behind a browser
  session. Their launch URLs are captured; their content is not reachable
  with an API token, so briefs that live in Ed stay out of the JSON.
- Personal access tokens can't be shared. If this ever backs a multi-user app,
  you need an OAuth2 developer key from the Canvas admins instead.

## Tests

```bash
python selftest.py
```

Runs the HTML conversion, weight computation and a full subject build against a
mock Canvas. No network, no token needed.





## Windows

`pip install -r requirements.txt` works unedited. The two platform differences
are handled by environment markers in that file rather than by commenting lines
out first:

- **`tzdata` installs on Windows only.** Windows ships no system timezone
  database, so `zoneinfo` has nothing to read and every `--timezone` lookup
  raises. macOS and Linux already carry one.
- **The two `pyobjc-framework-*` lines install on macOS only.** They back
  `--ocr`, which uses the macOS Vision framework. Elsewhere pip skips them
  instead of failing on them, and `--ocr` reports the missing library rather
  than crashing.

If you installed piecemeal and hit a timezone error anyway, the scraper names
the fix instead of raising a bare key error:

```
No timezone data for 'Australia/Sydney'. On Windows this usually means the
timezone database is missing: pip install tzdata
```

One caveat that is not Windows-specific: `pymupdf4llm` is a large install,
roughly 220 MB once onnxruntime and numpy come with it. Drop it from
requirements if that matters; `--extract` falls back to `pypdf` and says so on
each file.
