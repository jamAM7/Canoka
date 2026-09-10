# canvasbuddy — Canvas scraper

Pulls a student's Canvas subjects into a local corpus: one JSON document per
subject for code to query, plus the markdown views you actually put in a
prompt.

This repo is the data layer only. The app that consumes it — notes, calendar,
dashboard — is built separately.

## What it produces

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

## Quick start

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
See [scraper/README.md](scraper/README.md) for why.

Get a token from Canvas under Account, then Settings, then New Access Token.

## Documentation

[scraper/README.md](scraper/README.md) covers the document schema, the markdown
views, attachment conversion, coverage reporting, and every flag.

## Consuming the corpus

Read `out/index.json` for the subject list. Each entry names its JSON document
and its `views`, in filename order: the subject overview first, then one per
module. Load the view you need and send that, not the JSON.

The views render deterministically — no timestamps, no set iteration — so the
same module produces the same bytes every run. That is what makes them safe to
sit behind a prompt-cache breakpoint.
