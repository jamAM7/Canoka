#!/usr/bin/env python3
"""A subject's last scrape as rows for the app's database. Read-only.

    python week_rows.py subject 41201     # by subject code, or by Canvas course ID
    python week_rows.py week 41201 3      # one week's content, a row per item

Prints JSON for the app to upsert into Supabase (the credentials never come
near this script: it reads out/index.json and the subject's document, as
week.py does, and prints).

`subject` prints:

    course        the course row's fields
    canvas_host   the Canvas host the scrape ran against
    modules       the subject's Canvas modules, by Canvas module id
    weeks         placeholder modules for the teaching weeks Canvas has no module for
    week_count    how many teaching weeks the subject has in all
    assessments   the assignments rows

`week` prints one week's content as course_content rows, one per item:

    items   content_type, external_content_id, title, body_text (markdown),
            source_url, position, published, content_updated_at

It picks what week.py's render_week does (modules named for the week, items
named for it inside other modules, assessments named for it) and renders each
item with the same helpers, so body_text reads as the markdown views do. It
doesn't say which module each row belongs to: the app files every one under
the week's canonical module (lib/data/week-modules.ts).

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
import hashlib
import json
import re
import sys
from pathlib import Path

from canvas.render import (_assessment_lines, _demote, _gaps, _item_lines, _pages_by_slug,
                           assessments_for, has_content, week_label)

HERE = Path(__file__).resolve().parent

#: external_module_id of a synthetic week module is this plus the week number.
SYNTHETIC_PREFIX = "canoka:week:"
#: Teaching weeks in a UTS session.
SESSION_WEEKS = 12
#: Past this, a "week" in a name is something else, like week 52 of a year.
LAST_POSSIBLE_WEEK = 20

# Module item type -> course_content.content_type (an enum value). SubHeader and
# anything else is left out.
ITEM_KINDS = {"Page": "page", "File": "file", "Assignment": "assignment", "Quiz": "quiz",
              "Discussion": "discussion", "ExternalUrl": "link", "ExternalTool": "other"}
MODULE_ITEM = re.compile(r"/modules/items/(\d+)")
#: A row's text is a markdown snippet like the module views': headings demoted into place.
HEADING_FLOOR = 4


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", default=str(HERE / "out"), help="the scrape's output directory")
    commands = parser.add_subparsers(dest="command", required=True)
    subject = commands.add_parser("subject", help="a whole subject: course, modules, weeks, assignments")
    subject.add_argument("subject", help="subject code (e.g. 41201) or Canvas course ID")
    week = commands.add_parser("week", help="one week's content: a row per module item")
    week.add_argument("subject", help="subject code (e.g. 41201) or Canvas course ID")
    week.add_argument("week", type=int, help="week number, from 1")
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


def week_rows(document: dict, week: int) -> list[dict]:
    """The week's content as course_content rows, in the order a week reads."""
    pages = _pages_by_slug(document)
    files_by_id = {f["id"]: f for f in document.get("files") or []}
    assessments = {a["id"]: a for a in document.get("assessments") or [] if a.get("id")}
    quizzes = {q["id"]: q for q in document.get("quizzes") or [] if q.get("id")}
    discussions = document.get("discussions") or []
    rows: list[dict] = []
    seen: set[tuple[str, str]] = set()

    def add(kind, external_id, title, body, source_url=None, published=True, updated=None):
        body = (body or "").strip()
        key = (kind, external_id)
        # Nothing to say, or already added through another module: no row.
        if not external_id or not body or key in seen:
            return
        seen.add(key)
        rows.append({"content_type": kind, "external_content_id": external_id, "title": title or "Untitled",
                     "body_text": body, "source_url": source_url, "position": len(rows) + 1,
                     "published": published, "content_updated_at": updated})

    def add_assessment(assessment):
        add("assignment", assessment["id"], assessment.get("name"),
            "\n".join(_assessment_lines(assessment, files_by_id)),
            assessment.get("url"), assessment.get("published") is not False)

    def add_item(item):
        kind = ITEM_KINDS.get(item.get("type"))
        title = item.get("title")
        content_id = item.get("content_id")
        if content_id == "None":  # build.py's str(None), for an item with no content id
            content_id = None
        if kind == "page":
            slug = item.get("page_url")
            page = pages.get(slug or "")
            # Template filler and pages that were never retrieved say nothing.
            if page and not page.get("boilerplate"):
                add("page", slug, page.get("title") or title, "\n".join(_item_lines([item], pages, files_by_id)),
                    page.get("url") or item.get("url"), page.get("published") is not False, page.get("updated_at"))
        elif kind == "file" and content_id:
            record = files_by_id.get(content_id) or {}
            # A file's text is only here when the scrape ran with --extract; otherwise its name.
            add("file", content_id, record.get("name") or title,
                "\n".join(_item_lines([item], pages, files_by_id)),
                record.get("url") or item.get("url"), True, record.get("updated_at"))
        elif kind == "assignment" and content_id in assessments:
            add_assessment(assessments[content_id])
        elif kind == "quiz" and content_id:
            quiz = quizzes.get(content_id) or {}
            facts = [f"{quiz['question_count']} questions" if quiz.get("question_count") else "",
                     f"{quiz['time_limit_minutes']} minutes" if quiz.get("time_limit_minutes") else "",
                     f"{quiz['points_possible']} points" if quiz.get("points_possible") is not None else ""]
            lines = [f"### {title}", ""]
            if any(facts):
                lines += [f"_{'; '.join(f for f in facts if f)}_", ""]
            description = (quiz.get("description") or "").strip()
            if description:
                lines.append(_demote(description, floor=HEADING_FLOOR))
            add("quiz", content_id, quiz.get("title") or title, "\n".join(lines),
                quiz.get("url") or item.get("url"))
        elif kind == "discussion" and content_id:
            # Discussions in the document carry no id, only their URL, which ends in it.
            topic = next((d for d in discussions if (d.get("url") or "").rstrip("/").endswith("/" + content_id)), {})
            message = (topic.get("content") or "").strip()
            add("discussion", content_id, title,
                f"### {title}\n\n{_demote(message, floor=HEADING_FLOOR)}" if message else f"- {title}",
                topic.get("url") or item.get("url"))
        elif kind in ("link", "other"):
            found = MODULE_ITEM.search(item.get("url") or "")
            url = item.get("external_url") or ""
            external_id = found.group(1) if found else (hashlib.sha1(url.encode()).hexdigest()[:16] if url else None)
            body = ("\n".join(_item_lines([item], pages, files_by_id)) if kind == "link"
                    else f"- {title} (external tool)")
            add(kind, external_id, title, body, url or item.get("url"))

    modules = document.get("modules") or []
    # The same three places render_week looks, in the same order.
    for module in modules:
        if week_label(module.get("name")) == week and has_content(document, module):
            for item in module.get("items") or []:
                add_item(item)
            for assessment in assessments_for(document, module):
                add_assessment(assessment)
    for module in modules:
        if week_label(module.get("name")) is None:
            for item in module.get("items") or []:
                if week_label(item.get("title")) == week:
                    add_item(item)
    for assessment in document.get("assessments") or []:
        if assessment.get("id") and week_label(assessment.get("name")) == week:
            add_assessment(assessment)

    # SYNTHETIC ROW, not from Canvas: what the scrape couldn't read (a hidden Files tab, say), so
    # the review doesn't take a missing reading for one that doesn't exist. One per week, always
    # written and empty when nothing is missing, so an old caveat can't outlive the gap it described.
    caveat = " ".join(line for line in _gaps(document) if line.strip() and line.strip() != "---")
    rows.append({"content_type": "other", "external_content_id": f"canoka:coverage:{week}",
                 "title": "Canvas coverage note", "body_text": caveat, "source_url": None,
                 "position": len(rows) + 1, "published": True, "content_updated_at": None})
    return rows


def main() -> int:
    args = parse_args()
    out_dir = Path(args.out)
    entry, index = find_subject(out_dir, args.subject)
    document = json.loads((out_dir / entry["file"]).read_text(encoding="utf-8"))
    sys.stdout.reconfigure(encoding="utf-8")

    if args.command == "week":
        if not 1 <= args.week <= LAST_POSSIBLE_WEEK:
            raise SystemExit(f"Weeks run from 1 to {LAST_POSSIBLE_WEEK}.")
        print(json.dumps({"week": args.week,
                          "course": {"external_course_id": str(entry.get("course_id")),
                                     "course_code": entry.get("code")},
                          "items": week_rows(document, args.week)}, ensure_ascii=False))
        return 0

    print(json.dumps(subject_rows(document, index), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
