import json
import os
from pathlib import Path
from datetime import datetime, timedelta

from anthropic import Anthropic
from dotenv import load_dotenv
load_dotenv()

SUBJECT_FILE = Path(__file__).parent.parent / "scraper" / "out" / "41129-software-innovation-studio-spring-2026.json"
ASSESSMENT_ID = "277999"  # Project Pitch, for this first test

MODEL = "claude-sonnet-4-6"


def needs_subtasks(assessment):
    """Skip trivial/placeholder assessments (weekly journals, participation marks)."""
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


def main():
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

    client = Anthropic()  # reads ANTHROPIC_API_KEY from env
    raw_subtasks = generate_subtasks(client, context_md)
    subtasks = resolve_due_dates(raw_subtasks, assessment["due_at_local"])

    output = {
        "course_id": subject["subject"]["course_id"],
        "assignment_title": assessment["name"],
        "due_date": assessment["due_at_local"],
        "subtasks": [
            {
                "id": f"subtask_{i+1}",
                **st,
                "completed": False,
            }
            for i, st in enumerate(subtasks)
        ],
    }

    print("\n=== Generated subtask JSON ===")
    print(json.dumps(output, indent=2))

    out_path = Path(__file__).parent / "test_output.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)
    print(f"\nSaved to {out_path}")


if __name__ == "__main__":
    main()