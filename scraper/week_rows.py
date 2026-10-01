#!/usr/bin/env python3
"""A subject's last scrape as rows for the app's database. Read-only.

    python week_rows.py subject 41201     # by subject code, or by Canvas course ID

Prints JSON for the app to upsert into Supabase (the credentials never come
near this script: it reads out/index.json and the subject's document, as
week.py does, and prints):

    course        the course row's fields
    canvas_host   the Canvas host the scrape ran against
    modules       the subject's Canvas modules, by Canvas module id
    weeks         placeholder modules for the teaching weeks Canvas has no module for
    week_count    how many teaching weeks the subject has in all
    assessments   the assignments rows

Run scrape.py first; nothing here calls Canvas.

SYNTHETIC WEEK MODULES. Canvas modules aren't weeks. 41201 has a module per
week, but 41129 files its weekly slides as items titled "Week 3 - ..." inside
one "Learning Contents" module, and 41052 names no weeks at all. So that every
note can belong to a week, `weeks` lists a placeholder module for each
teaching week that no real module names:

    external_module_id  "canoka:week:N"
    name                "Week N"

They are made up here and exist nowhere in Canvas. The prefix is how the app
tells them from real modules. A week whose Canvas module is named "Week N" gets
no placeholder, so each week has exactly one module: the real one if there is
one, else the placeholder (lib/data/week-modules.ts). The weeks are a whole
session, at least 12 (lib/scraper/subjects.ts readWeeks), longer if the subject
names a later week in a module, module item or assessment.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from canvas.render import week_label

HERE = Path(__file__).resolve().parent

#: external_module_id of a synthetic week module is this plus the week number.
SYNTHETIC_PREFIX = "canoka:week:"
#: Teaching weeks in a UTS session.
SESSION_WEEKS = 12
#: Past this, a "week" in a name is something else, like week 52 of a year.
LAST_POSSIBLE_WEEK = 20


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", default=str(HERE / "out"), help="the scrape's output directory")
    commands = parser.add_subparsers(dest="command", required=True)
    subject = commands.add_parser("subject", help="a whole subject: course, modules, weeks, assignments")
    subject.add_argument("subject", help="subject code (e.g. 41201) or Canvas course ID")
    return parser.parse_args()


def find_subject(out_dir: Path, wanted: str) -> tuple[dict, dict]:
    """The index entry for a subject and the index itself."""
    index_path = out_dir / "index.json"
    if not index_path.exists():
        raise SystemExit(f"No {index_path}. Run scrape.py first.")
    index = json.loads(index_path.read_text(encoding="utf-8"))
    subjects = index.get("subjects") or []
    for entry in subjects:
        if wanted in (str(entry.get("code")), str(entry.get("course_id"))):
            return entry, index
    scraped = ", ".join(str(s.get("code") or s.get("course_id")) for s in subjects)
    raise SystemExit(f"No subject {wanted!r} in the last scrape. It has: {scraped or 'none'}.")


def day(stamp: str | None) -> str | None:
    """An ISO timestamp as the date part, for a `date` column."""
    return stamp[:10] if stamp else None


def last_week(document: dict) -> int:
    """The last teaching week: a session's worth, or later if the subject names one."""
    last = SESSION_WEEKS
    candidates = [week_label(a.get("name")) for a in document.get("assessments") or []]
    for module in document.get("modules") or []:
        candidates.append(week_label(module.get("name")))
        candidates += [week_label(item.get("title")) for item in module.get("items") or []]
    for week in candidates:
        if week and week <= LAST_POSSIBLE_WEEK:
            last = max(last, week)
    return last


def subject_rows(document: dict, index: dict) -> dict:
    subject = document["subject"]
    modules, without_id = [], 0
    for module in document.get("modules") or []:
        # Scraped before modules carried their Canvas id: no stable key to upsert on.
        if not module.get("id"):
            without_id += 1
            continue
        modules.append({
            "external_module_id": module["id"],
            "name": module.get("name") or f"Module {module['id']}",
            "position": module.get("position"),
            "unlock_at": module.get("unlock_at"),
            "published": module.get("published") is not False,
        })

    # The same rule as the database's course_modules.week_number: "Week N", 1 to 20.
    named = {week_label(m["name"]) for m in modules}
    last = last_week(document)
    weeks = [{"number": n, "external_module_id": f"{SYNTHETIC_PREFIX}{n}", "name": f"Week {n}"}
             for n in range(1, last + 1) if n not in named]

    assessments = [{
        "external_assignment_id": a["id"],
        "name": a.get("name") or f"Assignment {a['id']}",
        "description": a.get("brief"),
        "due_at": a.get("due_at"),
        "available_from": a.get("unlock_at"),
        "available_until": a.get("lock_at"),
        "points_possible": a.get("points_possible"),
        "assignment_group": a.get("group"),
        "weight": a.get("weight_pct"),
    } for a in document.get("assessments") or [] if a.get("id")]

    return {
        "course": {
            "external_course_id": str(subject["course_id"]),
            "course_code": subject.get("code"),
            "name": subject.get("name") or str(subject["course_id"]),
            "term_name": subject.get("session"),
            "start_date": day(subject.get("start_at")),
            "end_date": day(subject.get("end_at")),
        },
        "canvas_host": index.get("canvas_host"),
        "modules": modules,
        "modules_without_id": without_id,
        "weeks": weeks,
        "week_count": last,
        "assessments": assessments,
    }


def main() -> int:
    args = parse_args()
    out_dir = Path(args.out)
    entry, index = find_subject(out_dir, args.subject)
    document = json.loads((out_dir / entry["file"]).read_text(encoding="utf-8"))
    rows = subject_rows(document, index)
    sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps(rows, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
