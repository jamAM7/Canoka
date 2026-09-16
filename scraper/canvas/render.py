"""Turning a subject document into the markdown you actually put in a prompt.

The JSON is the storage layer: it exists so code can select from it — pick a
module, resolve a page pointer, drop the template filler. None of that works
over prose. But once the selection is made, braces, repeated keys and coverage
counters are pure cost; a model reasons over none of them.

So this is the other half. Give it a document and a module, get back markdown
carrying only what a model reads: the page bodies inlined behind their pointers,
the assessments that module is about, the marking criteria as a table.

Output is deterministic — no timestamps, no set iteration — because these
strings are meant to sit behind a prompt-cache breakpoint, and a single changed
byte invalidates the entry.
"""

from __future__ import annotations

import re

WEEK_RE = re.compile(r"\bweek\s*(\d{1,2})\b", re.I)


def week_label(text: str | None) -> int | None:
    """The week a module or assessment name refers to, if it names one.

    Subjects are wildly inconsistent here: 41201 numbers its modules, 41028
    numbers some of them, 41129 numbers assessments but not modules, and 41052
    numbers nothing. None is an ordinary answer, not a failure.
    """
    match = WEEK_RE.search(text or "")
    return int(match.group(1)) if match else None


HEADING_RE = re.compile(r"^(#{1,6})(\s+\S)")
FENCE_RE = re.compile(r"^\s*(```|~~~)")


def _demote(markdown: str, floor: int) -> str:
    """Push a page body's own headings below the ones around it.

    Canvas pages start their headings wherever the author felt like — usually
    h2 or h3. Dropped into a document that already uses those levels for the
    subject and the module, a page's own "## Overview" reads as a sibling of
    the module rather than part of it, and the outline a model infers is wrong.
    Shift the whole body down so its shallowest heading sits at `floor`, which
    keeps the relative structure inside the page intact.
    """
    lines = markdown.splitlines()
    fenced, levels = False, []
    for line in lines:
        if FENCE_RE.match(line):
            fenced = not fenced
        elif not fenced:
            match = HEADING_RE.match(line)
            if match:
                levels.append(len(match.group(1)))
    if not levels:
        return markdown

    shift = floor - min(levels)
    if shift <= 0:
        return markdown

    out, fenced = [], False
    for line in lines:
        if FENCE_RE.match(line):
            fenced = not fenced
        elif not fenced:
            match = HEADING_RE.match(line)
            if match:
                level = min(6, len(match.group(1)) + shift)
                line = "#" * level + line[len(match.group(1)):]
        out.append(line)
    return "\n".join(out)


def _table(headers: list[str], rows: list[list[str]]) -> list[str]:
    if not rows:
        return []
    clean = lambda cell: str(cell if cell is not None else "—").replace("|", "\\|")
    return [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join("---" for _ in headers) + " |",
        *["| " + " | ".join(clean(c) for c in row) + " |" for row in rows],
    ]


def _when(assessment: dict) -> str:
    return (assessment.get("due_at_local") or "—")[:16].replace("T", " ")


def _rubric_lines(rubric: list[dict]) -> list[str]:
    """Marking criteria as a table.

    Canvas gives these as criteria each holding a list of rating bands. Nested
    like that it reads as noise; as a table the bands line up and a model can
    actually tell a distinction from a pass.
    """
    if not rubric:
        return []
    bands: list[str] = []
    for criterion in rubric:
        for rating in criterion.get("ratings") or []:
            if rating.get("label") and rating["label"] not in bands:
                bands.append(rating["label"])

    lines = ["", "**Marking criteria**", ""]
    rows = []
    for criterion in rubric:
        by_label = {r.get("label"): r for r in criterion.get("ratings") or []}
        row = [criterion.get("criterion"), criterion.get("points")]
        row += [(by_label.get(band) or {}).get("detail") or "" for band in bands]
        rows.append(row)
    lines += _table(["Criterion", "Marks"] + bands, rows)

    details = [f"- **{c['criterion']}** — {c['detail']}"
               for c in rubric if c.get("detail")]
    if details:
        lines += ["", *details]
    return lines


def _assessment_lines(assessment: dict, files_by_id: dict) -> list[str]:
    lines = ["", f"### {assessment.get('name')}", ""]

    facts = []
    if assessment.get("weight_pct") is not None:
        facts.append(f"worth {assessment['weight_pct']}%")
    if assessment.get("due_at_local"):
        facts.append(f"due {_when(assessment)}")
    if assessment.get("is_group_work"):
        facts.append("group work")
    kinds = [k for k in assessment.get("submission_types") or [] if k != "none"]
    if kinds:
        facts.append(f"submit as {', '.join(kinds)}")
    if facts:
        lines += [f"_{'; '.join(facts)}_", ""]

    brief = (assessment.get("brief") or "").strip()
    if brief:
        lines.append(_demote(brief, floor=4))
    else:
        # An empty brief is ambiguous on its own, and the scraper already worked
        # out which kind of empty it is. Saying so beats letting a model answer
        # "there isn't one" when the task is simply described elsewhere.
        status = assessment.get("content_status") or {}
        where = status.get("likely_source") or []
        lines.append("_No brief in Canvas._" + (f" Likely in: {'; '.join(where)}." if where else ""))

    lines += _rubric_lines(assessment.get("rubric") or [])
    lines += _attachment_lines(assessment.get("attachments") or [], files_by_id)
    return lines


# An attached brief earns its place in a module view; a week of readings does
# not. Past this many characters the file is named and pointed at instead —
# the whole point of a module slice is that it is the ~1k tokens the question
# is actually about.
INLINE_LIMIT = 4000


def _attachment_lines(ids: list[str], files_by_id: dict, floor: int = 5) -> list[str]:
    """Name a module's attachments, inlining the short ones.

    Extracted text is markdown now, so a short brief is demoted into place the
    way a page body is, rather than blockquoted. Putting `> ` in front of a
    pipe table is exactly how you lose the marking criteria the conversion
    just worked to preserve.

    Longer files are named with the path to their converted `.md`, so the
    reading is one open away without costing the slice its size.
    """
    named = [files_by_id[i] for i in ids if i in files_by_id]
    if not named:
        return []
    lines = ["", "**Attached**", ""]
    for record in named:
        extracted = record.get("extracted") or {}
        text = (extracted.get("text") or "").strip()
        converted = record.get("markdown_path")
        if text and len(text) <= INLINE_LIMIT:
            lines += [f"- {record.get('name')}", "", _demote(text, floor=floor), ""]
        elif converted:
            lines.append(f"- {record.get('name')} \u2014 converted, see `{converted}`")
        else:
            lines.append(f"- {record.get('name')}")
    return lines


def _header(document: dict) -> list[str]:
    subject = document["subject"]
    title = f"# {subject.get('code') or ''} {subject.get('name') or ''}".strip()
    lines = [title]
    if subject.get("session"):
        lines.append(f"_{subject['session']}_")
    return lines


def _gaps(document: dict) -> list[str]:
    """Carry the coverage caveat into the prompt.

    Without it a hidden Files tab reads as "this subject has no readings", and
    a model will say so confidently.
    """
    coverage = document.get("_meta", {}).get("coverage", {})
    named = [f"{key} ({value.get('status')})"
             for key, value in coverage.items() if value.get("status") != "ok"]
    if not named:
        return []
    return ["", "---", "",
            "_Not retrieved, so their absence above is not evidence of absence: "
            + ", ".join(named) + "._"]


def _pages_by_slug(document: dict) -> dict:
    return {page["url_slug"]: page for page in document.get("pages") or []
            if page.get("url_slug")}


def assessments_for(document: dict, module: dict) -> list[dict]:
    """The assessments a module is about.

    Two signals, because no single one covers the subjects seen. A module item
    naming an assignment is definitive. Failing that, a shared week number
    catches 41129, which numbers its journals by week but files them all under
    one unnumbered module.
    """
    ids = {item.get("content_id") for item in module.get("items") or []
           if item.get("type") == "Assignment"}
    week = week_label(module.get("name"))
    chosen = []
    for assessment in document.get("assessments") or []:
        if assessment.get("id") in ids or (week and week_label(assessment.get("name")) == week):
            chosen.append(assessment)
    return chosen


def has_content(document: dict, module: dict) -> bool:
    """Whether a module renders to anything worth putting in a prompt.

    A module of nothing but template filler, or one that only names pages that
    were never retrieved, should produce no file at all — an empty one reads
    later like a week the subject genuinely had nothing to say about.
    """
    pages = _pages_by_slug(document)
    for item in module.get("items") or []:
        page = pages.get(item.get("page_url") or "")
        if page and not page.get("boilerplate") and (page.get("content") or "").strip():
            return True
        if item.get("type") == "ExternalUrl" and item.get("external_url"):
            return True
    return bool(assessments_for(document, module))


def render_module(document: dict, module: dict) -> str:
    """One module: its pages inlined, its assessments, its marking criteria."""
    pages = _pages_by_slug(document)
    files_by_id = {f["id"]: f for f in document.get("files") or []}
    week = week_label(module.get("name"))

    lines = _header(document)
    lines += ["", f"## {module.get('name')}"]
    if week:
        lines.append(f"_Week {week}_")

    missing = []
    for item in module.get("items") or []:
        slug = item.get("page_url")
        if not slug:
            continue
        page = pages.get(slug)
        # Template filler that UTS ships into every subject shell. Detected by
        # body rather than title, and dropped here rather than in the document,
        # so the JSON keeps a full record of what the subject actually holds.
        if page is None or page.get("boilerplate"):
            if page is None:
                missing.append(item.get("title") or slug)
            continue
        body = (page.get("content") or "").strip()
        if not body:
            continue
        lines += ["", f"### {page.get('title')}", "", _demote(body, floor=4)]
        lines += _attachment_lines(page.get("attachments") or [], files_by_id)

    links = [item for item in module.get("items") or []
             if item.get("type") == "ExternalUrl" and item.get("external_url")]
    if links:
        lines += ["", "**Links in this module**", ""]
        lines += [f"- [{item.get('title')}]({item['external_url']})" for item in links]

    chosen = assessments_for(document, module)
    if chosen:
        lines += ["", "## Assessment"]
        for assessment in chosen:
            lines += _assessment_lines(assessment, files_by_id)

    if missing:
        lines += ["", f"_Named but not retrieved: {', '.join(missing)}._"]

    lines += _gaps(document)
    return "\n".join(lines).strip() + "\n"


def render_subject(document: dict) -> str:
    """The whole subject at a glance: schedule, structure, syllabus.

    What `overview_markdown` already carries, plus the syllabus and a pointer at
    the per-module files, so this works as the shared prefix behind a prompt
    cache breakpoint while the module slices vary after it.
    """
    lines = [(document.get("overview_markdown") or "").strip()]

    syllabus = (document["subject"].get("syllabus") or "").strip()
    if syllabus:
        lines += ["", "## Subject outline", "", syllabus]

    return "\n".join(lines).strip() + "\n"


def module_slices(document: dict) -> list[tuple[str, str]]:
    """(filename stem, markdown) for every module that renders to something.

    A module holding nothing but boilerplate produces no file, rather than an
    empty one that later reads as a subject with a blank week.
    """
    from .build import slugify

    out: list[tuple[str, str]] = []
    seen: dict[str, int] = {}
    for module in document.get("modules") or []:
        if not has_content(document, module):
            continue
        markdown = render_module(document, module)
        stem = slugify(module.get("name") or "module", limit=40)
        seen[stem] = seen.get(stem, 0) + 1
        if seen[stem] > 1:
            stem = f"{stem}-{seen[stem]}"
        out.append((stem, markdown))
    return out
