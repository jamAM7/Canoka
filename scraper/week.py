#!/usr/bin/env python3
"""Print one week of a subject's Canvas content, from the last scrape.

    python week.py 41201 3            # a subject by its code
    python week.py 40948 3            # or by its Canvas course ID
    python week.py 41201 3 --json     # {"subject", "week", "markdown"}, for the app

It reads out/index.json and the subject's document, so run scrape.py first;
nothing here calls Canvas. A week that no module, module item or assessment
names has no content: nothing is printed, or "markdown" is null.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from canvas.render import render_week

HERE = Path(__file__).resolve().parent


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("subject", help="subject code (e.g. 41201) or Canvas course ID")
    parser.add_argument("week", type=int, help="week number, from 1")
    parser.add_argument("--out", default=str(HERE / "out"), help="the scrape's output directory")
    parser.add_argument("--json", action="store_true", help="print JSON rather than markdown")
    return parser.parse_args()


def find_subject(out_dir: Path, wanted: str) -> dict:
    index_path = out_dir / "index.json"
    if not index_path.exists():
        raise SystemExit(f"No {index_path}. Run scrape.py first.")
    subjects = json.loads(index_path.read_text(encoding="utf-8")).get("subjects") or []
    for entry in subjects:
        if wanted in (str(entry.get("code")), str(entry.get("course_id"))):
            return entry
    scraped = ", ".join(str(s.get("code") or s.get("course_id")) for s in subjects)
    raise SystemExit(f"No subject {wanted!r} in the last scrape. It has: {scraped or 'none'}.")


def main() -> int:
    args = parse_args()
    if args.week < 1:
        raise SystemExit("Weeks start at 1.")
    out_dir = Path(args.out)
    entry = find_subject(out_dir, args.subject)
    document = json.loads((out_dir / entry["file"]).read_text(encoding="utf-8"))
    markdown = render_week(document, args.week)

    if args.json:
        subject = {key: entry.get(key) for key in ("code", "name", "course_id")}
        print(json.dumps({"subject": subject, "week": args.week, "markdown": markdown},
                         ensure_ascii=False))
    elif markdown:
        print(markdown, end="")
    else:
        print(f"Nothing in the last scrape names week {args.week} of "
              f"{entry.get('code') or entry.get('name')}.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
