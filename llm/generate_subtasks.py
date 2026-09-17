import json
import os
from pathlib import Path
from datetime import datetime, timedelta

from anthropic import Anthropic
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

SUBJECT_FILE = Path(__file__).parent.parent / "scraper" / "out" / "41129-software-innovation-studio-spring-2026.json"
ASSESSMENT_ID = "277999"  # Project Pitch, for this first test

MODEL = "claude-sonnet-4-6"


def get_supabase():
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )


def needs_subtasks(assessment):
    if assessment.get("points_possible", 0) <= 2:
        return False
    if assessment.get("weight_pct", 0) < 10:
        return False
    return True


def build_context_markdown(subject, assessment):
    return f"""# {subject['subject']['code']} — {subject['subject']['name']}

## Assessment: {assessment['name']}
Weight: {assessment['weight_pct']}%
Points: {assessment['points_possible']}
Due: {assessment['due_at_local']}

### Brief
{assessment['brief']}
"""


SUBTASK_TOOL = {
    "name": "generate_subtasks",
    "description": "Generate an ordered list of subtasks to help a student complete this assignment on time and to a good standard.",
    "input_schema": {
        "type": "object",
        "properties": {
            "subtasks": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "order": {"type": "integer"},
                        "title": {"type": "string", "description": "Short, 3-8 words"},
                        "description": {"type": "string", "description": "1-2 sentences, what 'done' looks like"},
                        "due_offset_days": {
                            "type": "integer",
                            "description": "Days before the assignment due date this subtask should be completed by. Must be a positive integer.",
                        },
                        "estimated_minutes": {"type": "integer"},
                    },
                    "required": ["order", "title", "description", "due_offset_days"],
                },
            }
        },
        "required": ["subtasks"],
    },
}


def generate_subtasks(client, context_markdown):
    response = client.messages.create(
        model=MODEL,
        max_tokens=2000,
        tools=[SUBTASK_TOOL],
        tool_choice={"type": "tool", "name": "generate_subtasks"},
        messages=[
            {
                "role": "user",
                "content": (
                    "Here is the assignment context:\n\n"
                    f"{context_markdown}\n\n"
                    "Break this into an ordered sequence of subtasks a student should "
                    "complete to finish it on time and to a good standard."
                ),
            }
        ],
    )
    tool_use = next(b for b in response.content if b.type == "tool_use")
    return tool_use.input["subtasks"]


def resolve_due_dates(subtasks, assignment_due_at_local):
    due_dt = datetime.fromisoformat(assignment_due_at_local)
    for st in subtasks:
        offset_days = st.pop("due_offset_days")
        st["due_date"] = (due_dt - timedelta(days=offset_days)).isoformat()
    return subtasks


# ---------------------------------------------------------------------------
# Supabase writes
# ---------------------------------------------------------------------------

def get_or_create_study_plan(sb, user_id, course_code):
    existing = (
        sb.table("study_plans")
        .select("id")
        .eq("user_id", user_id)
        .eq("name", f"{course_code} study plan")
        .eq("status", "active")
        .execute()
    )
    if existing.data:
        return existing.data[0]["id"]

    created = (
        sb.table("study_plans")
        .insert({
            "user_id": user_id,
            "name": f"{course_code} study plan",
            "start_date": datetime.now().date().isoformat(),
            "end_date": (datetime.now().date() + timedelta(days=120)).isoformat(),
            "generated_by": "ai",
            "status": "active",
        })
        .execute()
    )
    return created.data[0]["id"]


def get_course_and_assignment_row_ids(sb, external_course_id, external_assignment_id):
    course = (
        sb.table("courses")
        .select("id")
        .eq("external_course_id", external_course_id)
        .single()
        .execute()
    )
    course_row_id = course.data["id"]

    assignment = (
        sb.table("assignments")
        .select("id")
        .eq("course_id", course_row_id)
        .eq("external_assignment_id", external_assignment_id)
        .single()
        .execute()
    )
    return course_row_id, assignment.data["id"]


def upsert_subtasks(sb, study_plan_id, course_row_id, assignment_row_id, subtasks):
    # Idempotent: clear old subtasks for this assignment before inserting fresh ones.
    sb.table("study_tasks").delete().eq("assignment_id", assignment_row_id).execute()

    rows = [
        {
            "study_plan_id": study_plan_id,
            "course_id": course_row_id,
            "assignment_id": assignment_row_id,
            "title": st["title"],
            "description": st["description"],
            "scheduled_date": st["due_date"][:10],
            "scheduled_start": st["due_date"],
            "estimated_minutes": st.get("estimated_minutes"),
            "order_index": st["order"],
            "status": "completed" if st.get("completed") else "pending",
        }
        for st in subtasks
    ]
    sb.table("study_tasks").insert(rows).execute()


def main():
    user_id = os.environ["SUPABASE_USER_ID"]

    with open(SUBJECT_FILE, encoding="utf-8") as f:
        subject = json.load(f)

    assessment = next(a for a in subject["assessments"] if a["id"] == ASSESSMENT_ID)

    if not needs_subtasks(assessment):
        print(f"Skipping '{assessment['name']}', doesn't meet the threshold for subtask generation.")
        return

    context_md = build_context_markdown(subject, assessment)
    print("=== Context sent to Claude ===")
    print(context_md)
    print("=" * 60)

    client = Anthropic()
    raw_subtasks = generate_subtasks(client, context_md)
    subtasks = resolve_due_dates(raw_subtasks, assessment["due_at_local"])

    for i, st in enumerate(subtasks):
        st["id"] = f"subtask_{i+1}"
        st["completed"] = False

    print("\n=== Generated subtasks ===")
    print(json.dumps(subtasks, indent=2))

    # --- write to Supabase ---
    sb = get_supabase()
    course_row_id, assignment_row_id = get_course_and_assignment_row_ids(
        sb, subject["subject"]["course_id"], assessment["id"]
    )
    study_plan_id = get_or_create_study_plan(sb, user_id, subject["subject"]["code"])
    upsert_subtasks(sb, study_plan_id, course_row_id, assignment_row_id, subtasks)

    print(f"\nSaved {len(subtasks)} subtasks to Supabase (study_plan {study_plan_id}, assignment {assignment_row_id})")


if __name__ == "__main__":
    raise SystemExit(main())