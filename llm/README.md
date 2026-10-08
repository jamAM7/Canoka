# LLM subtask generation

Takes a subject JSON file from the scraper (`../scraper/out/`) and generates
an ordered list of subtasks for a given assessment using the Claude API.

## Setup

`npm install` at the repo root installs `requirements.txt` into the shared
`.venv` there, so there's no virtualenv to set up here.

```bash
cp .env.example .env
# edit .env — add your Anthropic API key
```

## Run

```bash
../.venv/bin/python generate_subtasks.py   # ..\.venv\Scripts\python on Windows
```

Reads a hardcoded subject file and assessment ID for now (see the top of the
script), and writes the generated subtask JSON to `test_output.json`.

## Notes

- Assessments below a weight/points threshold are skipped entirely — see
  `needs_subtasks()`. This rule is tuned against one subject's data so far and
  may need adjusting once tested against others.
- Output format matches the contract shared with the UI team (see root README
  or ask Riya for the current `subtask-object-format.json`).