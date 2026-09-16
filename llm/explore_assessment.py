import json
from pathlib import Path

SUBJECT_FILE = Path(__file__).parent.parent / "scraper" / "out" / "41129-software-innovation-studio-spring-2026.json"


def needs_subtasks(assessment):
    """Skip trivial/placeholder assessments (weekly journals, participation marks)."""
    if assessment.get("points_possible", 0) <= 2:
        return False
    if assessment.get("weight_pct", 0) < 10:
        return False
    return True


def main():
    with open(SUBJECT_FILE, encoding="utf-8") as f:
        subject = json.load(f)

    print(f"Subject: {subject['subject']['code']} — {subject['subject']['name']}\n")

    for a in subject["assessments"]:
        flag = "SUBTASKS" if needs_subtasks(a) else "skip"
        print(f"[{flag:>9}] {a['name']}  (weight {a['weight_pct']}%, points {a['points_possible']})")

    print("\n" + "=" * 60)

    # Look closely at the Project Pitch specifically
    pitch = next(x for x in subject["assessments"] if x["id"] == "277999")
    print(f"\n=== {pitch['name']} ===")
    print(f"Weight: {pitch['weight_pct']}%  Points: {pitch['points_possible']}  Due: {pitch['due_at_local']}")
    print(f"Content status: {pitch['content_status']}")
    print(f"\nBrief:\n{pitch['brief']}")


if __name__ == "__main__":
    main()