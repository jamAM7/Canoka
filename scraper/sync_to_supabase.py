#!/usr/bin/env python3
"""Push a scraped subject JSON into Supabase: institutions -> courses ->
course_enrolments -> assignments. Run this before generate_subtasks.py.

    python sync_to_supabase.py out/41129-....json
    python sync_to_supabase.py out/*.json   # every subject
"""
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

CANVAS_BASE_URL = os.environ.get("CANVAS_BASE_URL", "").strip()


def get_supabase():
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )


def get_or_create_institution(sb, base_url):
    existing = (
        sb.table("institutions")
        .select("id")
        .eq("canvas_base_url", base_url)
        .execute()
    )
    if existing.data:
        return existing.data[0]["id"]

    created = (
        sb.table("institutions")
        .insert({"name": "UTS", "canvas_base_url": base_url})
        .execute()
    )
    return created.data[0]["id"]


def upsert_course(sb, institution_id, subject):
    row = {
        "institution_id": institution_id,
        "lms_provider": "canvas",
        "external_course_id": subject["course_id"],
        "course_code": subject["code"],
        "name": subject["name"],
        "term_name": subject["session"],
    }
    result = (
        sb.table("courses")
        .upsert(row, on_conflict="institution_id,external_course_id")
        .execute()
    )
    return result.data[0]["id"]


def get_or_create_enrolment(sb, user_id, course_row_id):
    existing = (
        sb.table("course_enrolments")
        .select("id")
        .eq("user_id", user_id)
        .eq("course_id", course_row_id)
        .execute()
    )
    if existing.data:
        return existing.data[0]["id"]

    created = (
        sb.table("course_enrolments")
        .insert({"user_id": user_id, "course_id": course_row_id})
        .execute()
    )
    return created.data[0]["id"]


def upsert_assignments(sb, course_row_id, assessments):
    rows = [
        {
            "course_id": course_row_id,
            "external_assignment_id": a["id"],
            "name": a["name"],
            "description": a.get("brief"),
            "due_at": a.get("due_at"),
            "available_from": a.get("unlock_at"),
            "available_until": a.get("lock_at"),
            "points_possible": a.get("points_possible"),
            "assignment_group": a.get("group"),
            "weight": a.get("weight_pct"),
        }
        for a in assessments
    ]
    if not rows:
        return
    sb.table("assignments").upsert(
        rows, on_conflict="course_id,external_assignment_id"
    ).execute()


def sync_subject_file(sb, path, user_id):
    with open(path, encoding="utf-8") as f:
        doc = json.load(f)

    subject = doc["subject"]
    institution_id = get_or_create_institution(sb, CANVAS_BASE_URL or subject["url"].split("/courses")[0])
    course_row_id = upsert_course(sb, institution_id, subject)
    get_or_create_enrolment(sb, user_id, course_row_id)
    upsert_assignments(sb, course_row_id, doc["assessments"])

    print(f"Synced {subject['code']}: {len(doc['assessments'])} assignments -> course {course_row_id}")
    return course_row_id


def main():
    if len(sys.argv) < 2:
        print("Usage: python sync_to_supabase.py <subject.json> [more.json ...]", file=sys.stderr)
        return 1

    user_id = os.environ.get("SUPABASE_USER_ID")
    if not user_id:
        print("Set SUPABASE_USER_ID in your .env (your users.id row).", file=sys.stderr)
        return 1

    sb = get_supabase()
    for path in sys.argv[1:]:
        sync_subject_file(sb, Path(path), user_id)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())