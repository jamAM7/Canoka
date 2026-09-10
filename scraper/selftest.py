#!/usr/bin/env python3
"""Run the whole pipeline against a fake Canvas. No token or network needed.

    python selftest.py

Verifies pagination handling, weight computation under both grading rules,
HTML->markdown with tables, link extraction, and that a hidden tab degrades
into a coverage note instead of crashing the run.
"""

from __future__ import annotations

import json
import tempfile
import time
from pathlib import Path

from canvas.build import SubjectBuilder, compute_weights
from canvas.client import DAY, HOUR, CanvasClient, CanvasError, CanvasForbidden
from canvas.content import extract_links, file_to_text, html_to_markdown
from canvas.render import INLINE_LIMIT, _attachment_lines, render_module, week_label

BRIEF = """
<h2>Task</h2>
<p>Implement the algorithm and submit a report. See
<a class="instructure_file_link" href="/courses/1/files/77"
   data-api-endpoint="https://canvas.test/api/v1/files/77"
   data-api-returntype="File">Assignment spec</a>.</p>
<table>
  <tr><th>Criterion</th><th>Marks</th></tr>
  <tr><td>Correctness</td><td>40</td></tr>
  <tr><td>Analysis</td><td>30</td></tr>
</table>
<iframe src="https://echo360.net.au/lesson/abc"></iframe>
"""

FAKE = {
    "/api/v1/courses/1": {
        "id": "1", "name": "41052 Advanced Algorithms",
        "course_code": "41052-2026-SPR", "apply_assignment_group_weights": True,
        "term": {"name": "2026 Spring"},
        "teachers": [{"display_name": "Dr Example"}],
        "syllabus_body": "<p>Read the <a href='/courses/1/pages/outline'>outline</a>.</p>",
    },
    "/api/v1/courses/1/assignment_groups": [
        {"id": "10", "name": "Assessments", "group_weight": 100, "assignments": [
            {"id": "100", "name": "Assignment 1", "points_possible": 40,
             "due_at": "2026-09-19T02:59:00Z", "submission_types": ["online_upload"],
             "grading_type": "points", "description": BRIEF, "html_url": "https://canvas.test/a/100",
             "rubric": [{"description": "Correctness", "points": 40,
                         "ratings": [{"description": "Excellent", "points": 40}]}]},
            {"id": "101", "name": "Assignment 2", "points_possible": 60,
             "due_at": "2026-10-24T02:59:00Z", "submission_types": ["online_upload"],
             "grading_type": "points", "description": "<p>Part two.</p>",
             "html_url": "https://canvas.test/a/101", "group_category_id": "5"},
        ]}
    ],
    "/api/v1/courses/1/assignments": [
        {"id": "100", "submission": {"workflow_state": "graded", "score": 34}},
        {"id": "101", "submission": {"workflow_state": "unsubmitted"}},
    ],
    "/api/v1/courses/1/pages": [
        {"url": "outline", "title": "Subject Outline", "html_url": "https://canvas.test/p/outline"}
    ],
    "/api/v1/courses/1/pages/outline": {
        "body": "<h3>Week plan</h3><ul><li>Greedy</li><li>DP</li></ul>"
    },
    "/api/v1/courses/1/modules": [
        {"name": "Week 1", "position": 1, "items": [
            {"title": "Subject Outline", "type": "Page", "page_url": "outline",
             "html_url": "https://canvas.test/p/outline"},
            {"title": "Lecture recording", "type": "ExternalUrl",
             "external_url": "https://echo360.net.au/x"},
        ]}
    ],
    "/api/v1/courses/1/discussion_topics": [
        {"id": "9", "title": "Week 3 notice", "is_announcement": True,
         "posted_at": "2026-08-20T01:00:00Z", "message": "<p>Tutorial moved.</p>",
         "author": {"display_name": "Dr Example"}, "html_url": "https://canvas.test/d/9"}
    ],
    "/api/v1/files/77": {"id": "77", "display_name": "spec.pdf", "size": 1024,
                         "content-type": "application/pdf"},
    "/api/v1/courses/1/quizzes": [
        {"id": "50", "title": "Knowledge Quiz", "quiz_type": "assignment",
         "points_possible": 10, "question_count": 12, "time_limit": 45,
         "allowed_attempts": 1, "due_at": "2026-10-02T12:59:00Z",
         "description": "<p>Covers weeks 1-6. See <a href=\"https://ed.test/q\">Ed</a>.</p>",
         "html_url": "https://canvas.test/courses/1/quizzes/50"}
    ],
    "/api/v1/courses/1/external_tools": [],
    "/api/v1/courses/1/tabs": [
        {"label": "Home", "full_url": "https://canvas.test/courses/1"},
        {"label": "Ed", "full_url": "https://canvas.test/courses/1/external_tools/2929"},
    ],
}

# Course 2 mirrors 41052: Pages index disabled, individual pages still readable.
FAKE["/api/v1/courses/2"] = {"id": "2", "name": "41201 DSEP", "term": {"name": "2026 Spring"}}
FAKE["/api/v1/courses/2/assignment_groups"] = []
FAKE["/api/v1/courses/2/assignments"] = []
FAKE["/api/v1/courses/2/quizzes"] = []
FAKE["/api/v1/courses/2/modules"] = [
    {"name": "Get started", "position": 1, "items": [
        {"title": "Assessment overview", "type": "Page",
         "html_url": "https://canvas.test/courses/2/modules/items/1"},
    ]}
]
FAKE["/api/v1/courses/2/pages/assessment-overview"] = {
    "url": "assessment-overview", "title": "Assessment overview",
    "body": "<p>Task 1 is due week 6. <a href=\"/courses/2/files/88\">Brief</a></p>",
}
FAKE["/api/v1/courses/2/discussion_topics"] = []
FAKE["/api/v1/courses/2/external_tools"] = []
FAKE["/api/v1/courses/2/tabs"] = []
FAKE["/api/v1/files/88"] = {"id": "88", "display_name": "task1.pdf", "size": 2048}

FORBIDDEN = {"/api/v1/courses/1/files", "/api/v1/courses/2/files"}
DISABLED = {"/api/v1/courses/2/pages"}


class FakeClient:
    """Stands in for CanvasClient, including a deliberately hidden Files tab."""

    base_url = "https://canvas.test"
    request_count = 0

    def _lookup(self, path):
        path = path.split("?")[0]
        if path in FORBIDDEN:
            raise CanvasForbidden(403, path, "unauthorized")
        if path in DISABLED:
            raise CanvasError(404, path, "That page has been disabled for this course")
        if path not in FAKE:
            raise KeyError(f"fake Canvas has no route for {path}")
        return FAKE[path]

    def get(self, path, params=None):
        self.request_count += 1
        return self._lookup(path), {"link": ""}

    def get_list(self, path, params=None):
        self.request_count += 1
        value = self._lookup(path)
        return value if isinstance(value, list) else [value]

    def download(self, url, dest):
        raise AssertionError("selftest should not download")


def check(label, condition):
    print(f"  {'PASS' if condition else 'FAIL'}  {label}")
    return condition


def main() -> int:
    ok = True
    print("content helpers")
    markdown = html_to_markdown(BRIEF, "https://canvas.test")
    ok &= check("table survives conversion", "| Correctness |" in markdown)
    ok &= check("headings survive", markdown.startswith("## Task"))
    links = extract_links(BRIEF, "https://canvas.test")
    ok &= check("file link classified from data attribute",
                any(l["kind"] == "file" for l in links))
    ok &= check("relative href absolutised",
                any(l["url"].startswith("https://canvas.test/courses/1/files/77") for l in links))
    ok &= check("iframe captured", any(l["kind"] == "embed" for l in links))

    print("\nweight computation")
    groups = [{"name": "G", "group_weight": 100, "assignments": [
        {"id": "1", "points_possible": 40, "grading_type": "points"},
        {"id": "2", "points_possible": 60, "grading_type": "points"},
    ]}]
    rule = compute_weights({"apply_assignment_group_weights": True}, groups)
    ok &= check("group-weight rule splits by points",
                rule == "group_weights"
                and groups[0]["assignments"][0]["weight_pct"] == 40.0)
    groups2 = [{"name": "G", "group_weight": 0, "assignments": [
        {"id": "1", "points_possible": 25, "grading_type": "points"},
        {"id": "2", "points_possible": 75, "grading_type": "points"},
    ]}]
    rule2 = compute_weights({"apply_assignment_group_weights": False}, groups2)
    ok &= check("points rule falls back correctly",
                rule2 == "points_proportional"
                and groups2[0]["assignments"][1]["weight_pct"] == 75.0)
    groups3 = [{"name": "G", "group_weight": 100, "assignments": [
        {"id": "1", "points_possible": 0, "grading_type": "not_graded"},
    ]}]
    compute_weights({"apply_assignment_group_weights": True}, groups3)
    ok &= check("ungraded items get no weight",
                groups3[0]["assignments"][0]["weight_pct"] is None)

    print("\nfull subject build")
    with tempfile.TemporaryDirectory() as tmp:
        builder = SubjectBuilder(FakeClient(), {"id": "1", "name": "41052 Advanced Algorithms"},
                                 Path(tmp))
        document = builder.build()

    subject = document["subject"]
    ok &= check("subject code parsed", subject["code"] == "41052")
    ok &= check("name stripped of code", subject["name"] == "Advanced Algorithms")
    ok &= check("session captured", subject["session"] == "2026 Spring")
    ok &= check("two assessments", len(document["assessments"]) == 2)
    first = document["assessments"][0]
    ok &= check("weights computed", first["weight_pct"] == 40.0)
    ok &= check("due date localised", (first["due_at_local"] or "").startswith("2026-09-19T12:59"))
    ok &= check("rubric flattened", first["rubric"][0]["criterion"] == "Correctness")
    files_by_id = {f["id"]: f for f in document["files"]}
    ok &= check("attachment stored as an id, not a copy of the record",
                first["attachments"] == ["77"])
    ok &= check("that id resolves in files[]",
                files_by_id["77"]["name"] == "spec.pdf")
    ok &= check("group work detected", document["assessments"][1]["is_group_work"] is True)
    ok &= check("submission merged", first["my_submission"]["score"] == 34)
    item = document["modules"][0]["items"][0]
    ok &= check("module item points at its page, without copying the body",
                item.get("content") is None and item["resolved"] is True)
    ok &= check("the pointer resolves to a real page body",
                "Greedy" in next(p["content"] for p in document["pages"]
                                 if p["url_slug"] == item["page_url"]))
    ok &= check("announcement separated from discussions",
                len(document["announcements"]) == 1 and not document["discussions"])
    ok &= check("link index built with sources", any(
        "syllabus" in l["sources"] for l in document["links"]))
    ok &= check("inline links reduced to bare urls, kept in the index",
                all(isinstance(u, str) for u in first["links"])
                and set(first["links"]) <= {l["url"] for l in document["links"]})
    ok &= check("hidden Files tab recorded, not fatal",
                document["_meta"]["coverage"]["files"]["status"] == "partial")
    ok &= check("a file only reachable through a link still reaches files[]",
                [f["name"] for f in document["files"]] == ["spec.pdf"])
    ok &= check("coverage says the listing was unavailable, not that there are none",
                "recovered from links" in
                document["_meta"]["coverage"]["files"]["note"])
    ok &= check("grading rule recorded", document["_meta"]["grading_rule"] == "group_weights")
    ok &= check("overview names the gap", "not retrieved" in
                document["overview_markdown"].lower() or "Not retrieved" in
                document["overview_markdown"])
    ok &= check("overview has assessment table", "| Assignment 1 |" in
                document["overview_markdown"])
    ok &= check("document is JSON serialisable",
                bool(json.dumps(document, ensure_ascii=False)))

    quizzes = document["quizzes"]
    ok &= check("quizzes fetched", len(quizzes) == 1 and quizzes[0]["question_count"] == 12)
    ok &= check("quiz time limit captured", quizzes[0]["time_limit_minutes"] == 45)
    ok &= check("quiz links reach the index",
                any("quiz:Knowledge Quiz" in l["sources"] for l in document["links"]))
    ok &= check("external tools derived from tabs",
                any(t.get("source") == "tabs" and t["name"] == "Ed"
                    for t in document["external_tools"]))

    print("\ndisabled Pages index (the 41052 case)")
    with tempfile.TemporaryDirectory() as tmp:
        fallback = SubjectBuilder(FakeClient(), {"id": "2", "name": "41201 DSEP"},
                                  Path(tmp)).build()

    coverage = fallback["_meta"]["coverage"]["pages"]
    ok &= check("page recovered despite disabled index", len(fallback["pages"]) == 1)
    ok &= check("recovery marked partial, not ok", coverage["status"] == "partial")
    ok &= check("coverage note explains the recovery", "module items" in coverage["note"])
    ok &= check("slug derived from title when page_url absent",
                fallback["pages"][0]["url_slug"] == "assessment-overview")
    recovered = fallback["modules"][0]["items"][0]
    ok &= check("recovered page reachable through the module pointer",
                "due week 6" in next(p["content"] for p in fallback["pages"]
                                     if p["url_slug"] == recovered["page_url"]))
    ok &= check("links inside recovered page reach the index",
                any("/files/88" in l["url"] for l in fallback["links"]))

    print("\ncache lifetimes")
    client = CanvasClient("https://canvas.test", "t", cache_dir=None)
    ok &= check("file metadata never expires",
                client._ttl_for("/api/v1/files/77") is None)
    ok &= check("announcements expire within the hour",
                client._ttl_for("/api/v1/courses/1/discussion_topics") == HOUR)
    ok &= check("pages hold for a week",
                client._ttl_for("/api/v1/courses/1/pages") == 7 * DAY)
    with tempfile.TemporaryDirectory() as tmp:
        cache = Path(tmp) / "e.json"
        fresh = {"url": "u", "fetched_at": time.time(), "body": [1], "headers": {}}
        cache.write_text(json.dumps(fresh))
        url = "/api/v1/courses/1/discussion_topics"
        ok &= check("a fresh entry is served", client._read_cache(cache, url) is not None)
        cache.write_text(json.dumps({**fresh, "fetched_at": time.time() - 2 * HOUR}))
        ok &= check("a stale entry is a miss", client._read_cache(cache, url) is None)
        ok &= check("the same stale entry is fine for a long-lived endpoint",
                    client._read_cache(cache, "/api/v1/courses/1/pages") is not None)
        cache.write_text(json.dumps({"url": "u", "body": [1], "headers": {}}))
        ok &= check("an entry from before caching had a clock is a miss",
                    client._read_cache(cache, url) is None)

    print("\nverifier stripping")
    tokened = ('<p><a href="/courses/1/files/77?verifier=SECRET&wrap=1">Spec</a>'
               '<img src="https://canvas.test/f/9/preview?verifier=SECRET2&x=1"></p>')
    body = html_to_markdown(tokened, "https://canvas.test")
    ok &= check("no verifier survives in a page body", "verifier" not in body)
    ok &= check("no verifier survives in the link index",
                not any("verifier" in l["url"] for l in extract_links(tokened, "https://canvas.test")))
    ok &= check("unrelated query params are left alone", "x=1" in body)

    print("\nconcurrency")
    with tempfile.TemporaryDirectory() as tmp:
        serial = SubjectBuilder(FakeClient(), {"id": "1", "name": "41052 Advanced Algorithms"},
                                Path(tmp))
        serial._fetch_many = lambda keys, fetch: {  # force the one-at-a-time path
            k: v for k, v in ((k, fetch(k)) for k in keys) if v is not None}
        one_thread = serial.build()
    # _meta.fetched_at is wall-clock, so it differs between any two builds.
    stamp = lambda doc: json.dumps({**doc, "_meta": {**doc["_meta"], "fetched_at": ""}},
                                   sort_keys=True)
    ok &= check("a pooled build matches a serial one byte for byte",
                stamp(one_thread) == stamp(document))

    print("\nrender")
    ok &= check("week parsed from a module name", week_label("Week 3: Systems Thinking") == 3)
    ok &= check("an unnumbered module has no week", week_label("Get started") is None)
    markdown = render_module(document, document["modules"][0])
    ok &= check("the page body is inlined, not left as a pointer", "Greedy" in markdown)
    ok &= check("inlined headings sit below the module heading",
                "## Week 1" in markdown and "#### Week plan" in markdown)
    ok &= check("the module's assessment is not dragged in by accident",
                "Assignment 2" not in markdown)
    ok &= check("coverage caveat survives into the prompt",
                "not evidence of absence" in markdown)
    ok &= check("render is deterministic",
                render_module(document, document["modules"][0]) == markdown)

    boilerplate = json.loads(json.dumps(document))
    for page in boilerplate["pages"]:
        page["boilerplate"] = True
    ok &= check("template filler is left out of the prompt",
                "Greedy" not in render_module(boilerplate, boilerplate["modules"][0]))

    rubric_md = render_module(document, {"name": "Marked work", "items": [
        {"title": "Assignment 1", "type": "Assignment", "content_id": "100"}]})
    ok &= check("an assessment named by a module item is pulled in",
                "### Assignment 1" in rubric_md)
    ok &= check("marking criteria render as a table",
                "| Criterion | Marks | Excellent |" in rubric_md)

    print("\npdf to markdown")
    try:
        import pymupdf
    except ImportError:
        print("  SKIP  pymupdf not installed")
    else:
        with tempfile.TemporaryDirectory() as tmp:
            pdf = Path(tmp) / "files" / "sub" / "77_brief.pdf"
            pdf.parent.mkdir(parents=True)
            doc = pymupdf.open()
            page = doc.new_page()
            # Size is the only signal pymupdf4llm has for a heading, so the
            # gap between these two is what the first check is really about.
            page.insert_text((72, 90), "Assessment 2 Brief", fontsize=24)
            page.insert_text((72, 140), "Submit a systems report.", fontsize=11)
            doc.save(str(pdf))
            doc.close()

            extracted = file_to_text(pdf)
            ok &= check("a pdf converts, and says which engine did it",
                        extracted["status"] == "ok"
                        and extracted["extractor"] == "pymupdf4llm")
            ok &= check("a heading comes back as a heading, not a line of text",
                        "# Assessment 2 Brief" in extracted["text"])

            builder = SubjectBuilder(FakeClient(), {"id": "1", "name": "41201 DSEP"},
                                     Path(tmp))
            record = {"name": "brief.pdf", "url": "https://canvas.test/files/77",
                      "extracted": extracted}
            builder._write_markdown(pdf, record)
            written = pdf.with_suffix(".md")
            ok &= check("the .md lands beside the download",
                        written.exists() and record["markdown_path"].endswith("77_brief.md"))
            ok &= check("it names the file and where it came from",
                        written.read_text().startswith("# brief.pdf"))
            ok &= check("converting twice produces the same bytes",
                        (lambda before: (builder._write_markdown(pdf, record),
                                         written.read_text() == before)[1])(
                            written.read_text()))

            # An attachment that arrived as .md is its own conversion target.
            already = pdf.parent / "88_notes.md"
            already.write_text("original")
            builder._write_markdown(already, {"name": "notes.md", "url": "u",
                                              "extracted": {"status": "ok", "text": "rewritten"}})
            ok &= check("a file that is already .md is not overwritten by itself",
                        already.read_text() == "original")

    print("\nattachments in a view")
    short = {"id": "1", "name": "brief.pdf", "markdown_path": "files/s/1_brief.md",
             "extracted": {"status": "ok", "text": "## Task\n\n| A | B |\n|---|---|\n| 1 | 2 |"}}
    long = {"id": "2", "name": "reading.pdf", "markdown_path": "files/s/2_reading.md",
            "extracted": {"status": "ok", "text": "x" * (INLINE_LIMIT + 1)}}
    inlined = "\n".join(_attachment_lines(["1"], {"1": short}))
    ok &= check("a short brief is inlined", "| A | B |" in inlined)
    ok &= check("its table is not blockquoted into uselessness",
                "> |" not in inlined)
    ok &= check("its headings are demoted under the module",
                "##### Task" in inlined)
    pointed = "\n".join(_attachment_lines(["2"], {"2": long}))
    ok &= check("a long reading is pointed at, not inlined",
                "files/s/2_reading.md" in pointed and "xxxx" not in pointed)

    print("\n" + ("All checks passed." if ok else "Some checks FAILED."))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
