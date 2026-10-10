#!/usr/bin/env python3
"""Generate synthetic dataset for the Dira hackathon demo.

This script is intentionally limited to data generation only. Cleaning,
validation, and testing logic belong in separate scripts.

Output files:
- learners.csv
- observations.csv
- activity_tests.csv
- school_calendar.csv
- optionally teacher_reviews.csv (if --include-teacher-reviews is set)
"""

from __future__ import annotations

import argparse
import csv
import random
from datetime import date, timedelta
from pathlib import Path


THEMES = [
    "Collaboration",
    "Independent problem solving",
    "Confidence in class discussion",
    "Following instructions",
    "Self-regulation",
    "Peer support",
    "Persistence",
    "Participation",
    "Reading comprehension",
    "Task completion",
]

SUGGESTED_ACTIVITIES = [
    "Unassigned group-leadership task",
    "Pair reading with turn-taking roles",
    "Short collaborative puzzle challenge",
    "Teacher-guided checklist task",
    "Small-group problem solving without assigned leader",
    "Role-reversal explanation task",
]

VERIFICATION_OPTIONS = [
    "Pending",
    "Needs more evidence",
    "Repeated pattern",
    "Verified by multiple teachers",
    "Inconclusive",
]

SOURCE_TYPES = [
    "Voice transcription",
    "Text note",
    "Phone callback",
    "Teacher chat",
]

YEAR_GROUPS = ["Grade 4", "Grade 5", "Grade 6"]
PERIODS = [
    (1, "08:45", "09:45"),
    (2, "09:45", "10:45"),
    (3, "11:15", "12:15"),
    (4, "13:00", "14:00"),
    (5, "14:00", "15:00"),
]
SUBJECTS_BY_YEAR_GROUP = {
    "Grade 4": ["Mathematics", "English", "Science", "Humanities", "Arts"],
    "Grade 5": ["Mathematics", "English", "Science", "Humanities", "Health and Physical Education"],
    "Grade 6": ["Mathematics", "English", "Science", "Humanities", "Design and Technology"],
}


def generate_learners(count: int, academic_year: int) -> list[dict]:
    learners = []
    grade_levels = ["Grade 4", "Grade 4", "Grade 5", "Grade 5", "Grade 6", "Grade 6"]
    enrolment_statuses = ["Active", "Active", "At risk", "Active", "Active", "Transitioning"]

    for idx in range(count):
        learner_id = f"L{idx + 1:03d}"
        learners.append(
            {
                "learner_id": learner_id,
                "grade_level": grade_levels[idx % len(grade_levels)],
                "academic_year": academic_year,
                "enrolment_status": enrolment_statuses[idx % len(enrolment_statuses)],
            }
        )
    return learners


def create_observation_id(index: int) -> str:
    return f"OBS{index:03d}"


def create_test_id(index: int) -> str:
    return f"TEST{index:03d}"


def random_date(start: date, end: date) -> date:
    delta = (end - start).days
    return start + timedelta(days=random.randint(0, delta))


def term_for_date(value: date) -> str:
    if value.month <= 3:
        return "Term 1"
    if value.month <= 6:
        return "Term 2"
    if value.month <= 9:
        return "Term 3"
    return "Term 4"


def first_weekday_of_month(year: int, month: int, weekday: int) -> date:
    value = date(year, month, 1)
    return value + timedelta(days=(weekday - value.weekday()) % 7)


def events_for_date(value: date) -> tuple[str, str]:
    math_week_start = first_weekday_of_month(value.year, 5, 0)
    reading_week_start = first_weekday_of_month(value.year, 2, 0)
    if math_week_start <= value < math_week_start + timedelta(days=5):
        return "Mathematics Week", "Curriculum week"
    if reading_week_start <= value < reading_week_start + timedelta(days=5):
        return "Reading Week", "Curriculum week"
    if value.month == 9 and value.weekday() == 4 and 8 <= value.day <= 14:
        return "Science Fair", "School event"
    if value.month == 11 and value.weekday() == 4 and 15 <= value.day <= 21:
        return "Sports Day", "School event"
    return "", ""


def generate_school_calendar(start_year: int, end_year: int) -> list[dict]:
    calendar_rows: list[dict] = []
    entry_number = 1

    for year in range(start_year, end_year + 1):
        current_date = date(year, 1, 1)
        last_date = date(year, 12, 31)
        while current_date <= last_date:
            if current_date.weekday() < 5:
                event_name, event_type = events_for_date(current_date)
                for year_group in YEAR_GROUPS:
                    subjects = SUBJECTS_BY_YEAR_GROUP[year_group]
                    for period_number, start_time, end_time in PERIODS:
                        subject = subjects[(current_date.weekday() + period_number - 1) % len(subjects)]
                        planned_activity = ""
                        if event_name == "Mathematics Week" and subject == "Mathematics":
                            planned_activity = "Collaborative mathematics challenge"
                        elif event_name == "Reading Week" and subject == "English":
                            planned_activity = "Collaborative reading activity"

                        calendar_rows.append(
                            {
                                "calendar_entry_id": f"CAL{entry_number:06d}",
                                "calendar_date": current_date.isoformat(),
                                "academic_year": year,
                                "term": term_for_date(current_date),
                                "year_group": year_group,
                                "weekday": current_date.strftime("%A"),
                                "period_number": period_number,
                                "start_time": start_time,
                                "end_time": end_time,
                                "subject": subject,
                                "planned_activity": planned_activity,
                                "event_name": event_name,
                                "event_type": event_type,
                            }
                        )
                        entry_number += 1
            current_date += timedelta(days=1)

    return calendar_rows


def generate_observations(
    learners: list[dict],
    teacher_ids: list[str],
    calendar_rows: list[dict],
    seed: int,
) -> tuple[list[dict], list[str]]:
    random.seed(seed)
    observations: list[dict] = []
    observation_counter = 1
    year_groups = {
        year_group: [
            row
            for row in calendar_rows
            if row["year_group"] == year_group
            and date(2025, 1, 1) <= date.fromisoformat(row["calendar_date"]) <= date(2026, 9, 1)
        ]
        for year_group in YEAR_GROUPS
    }
    mathematics_week_rows = [
        row
        for row in calendar_rows
        if row["event_name"] == "Mathematics Week"
        and row["subject"] == "Mathematics"
        and row["planned_activity"]
    ]

    for learner in learners:
        learner_id = learner["learner_id"]
        year_group = learner["grade_level"]
        num_observations = random.randint(3, 6)

        for _ in range(num_observations):
            is_calendar_example = observation_counter == 1 and bool(mathematics_week_rows)
            if is_calendar_example:
                calendar_entry = mathematics_week_rows[0]
            else:
                calendar_entry = random.choice(year_groups[year_group])
            observation_date = date.fromisoformat(calendar_entry["calendar_date"])
            teacher_id = random.choice(teacher_ids)
            if is_calendar_example:
                activity_context = "Group activity"
            else:
                activity_context = random.choice([
                    "Group project",
                    "Whole-class discussion",
                    "Independent task",
                    "Pair work",
                    "Practical activity",
                    "Reading session",
                    "Math task",
                ])

            base_templates = [
                "Helped peers divide tasks and stayed focused on the group goal.",
                "Needed a second explanation but then completed the task correctly.",
                "Asked a clarifying question before starting and worked independently.",
                "Was quiet at first but contributed to the discussion once prompted.",
                "Completed the task quickly but needed support to explain the reasoning.",
                "Kept re-engaging after distraction and eventually finished the task.",
                "Worked well with a partner and encouraged another learner to continue.",
                "Struggled to start, then improved after a short teacher check-in.",
            ]

            if is_calendar_example:
                original_observation = "The learner contributed several ideas during the group activity."
            else:
                original_observation = random.choice(base_templates)
            if not is_calendar_example and random.random() < 0.25:
                original_observation = random.choice([
                    "Helped the group organize the task without being told.",
                    "Needed repeated reminders to stay with the activity.",
                    "Volunteered an answer and explained thinking to peers.",
                    "Stayed engaged in the task but was hesitant to speak in front of the class.",
                ])

            observation = {
                "observation_id": create_observation_id(observation_counter),
                "learner_id": learner_id,
                "observation_date": observation_date.isoformat(),
                "term": calendar_entry["term"],
                "calendar_entry_id": calendar_entry["calendar_entry_id"],
                "teacher_id": teacher_id,
                "activity_context": activity_context,
                "original_observation": original_observation,
                "source_type": random.choice(SOURCE_TYPES),
                "possible_theme": random.choice(THEMES),
                "verification_status": random.choice(VERIFICATION_OPTIONS),
            }
            observations.append(observation)
            observation_counter += 1

    return observations, [obs["observation_id"] for obs in observations]


def generate_activity_tests(learners: list[dict], observations: list[dict], teacher_ids: list[str], seed: int) -> list[dict]:
    random.seed(seed + 10)
    tests: list[dict] = []
    outcome_counter = 1
    used_observation_ids: dict[str, list[str]] = {}

    for learner in learners:
        learner_id = learner["learner_id"]
        learner_obs = [obs for obs in observations if obs["learner_id"] == learner_id]

        if not learner_obs:
            continue

        # Some learners get a suggested activity; others get only a few observations.
        activity_count = random.randint(1, 2) if random.random() < 0.75 else 0
        for i in range(activity_count):
            trigger_ids = random.sample([obs["observation_id"] for obs in learner_obs], k=min(2, len(learner_obs)))
            used_observation_ids[learner_id] = trigger_ids
            test_date = random_date(date(2025, 2, 1), date(2026, 9, 1))
            conducting_teacher = random.choice(teacher_ids)
            suggested_activity = random.choice(SUGGESTED_ACTIVITIES)
            status = random.choice(["Completed", "In progress", "Completed", "Pending"])

            outcome_observation_id = ""
            observed_outcome = ""
            if status == "Completed":
                outcome_observation_id = create_observation_id(1000 + outcome_counter)
                outcome_counter += 1
                observed_outcome = random.choice([
                    "Helped peers divide tasks and stayed with the task without repeated prompting.",
                    "Completed the task with fewer prompts than before and explained the final answer.",
                    "Participated more confidently in the group and took a leadership role when asked.",
                    "Needed support at the start but recovered after a short check-in.",
                ])

            tests.append(
                {
                    "test_id": create_test_id(len(tests) + 1),
                    "learner_id": learner_id,
                    "trigger_observation_ids": ", ".join(trigger_ids),
                    "suggested_activity": suggested_activity,
                    "activity_date": test_date.isoformat(),
                    "conducting_teacher_id": conducting_teacher,
                    "observed_outcome": observed_outcome,
                    "outcome_observation_id": outcome_observation_id,
                    "status": status,
                }
            )

    return tests


def generate_teacher_reviews(learners: list[dict], observations: list[dict], tests: list[dict], teacher_ids: list[str]) -> list[dict]:
    reviews = []
    note_index = 1

    for learner in learners:
        learner_id = learner["learner_id"]
        relevant_obs = [obs["observation_id"] for obs in observations if obs["learner_id"] == learner_id]
        relevant_tests = [test for test in tests if test["learner_id"] == learner_id]
        if not relevant_obs and not relevant_tests:
            continue

        evidence_ids = relevant_obs[:3]
        if relevant_tests:
            evidence_ids.append(relevant_tests[0]["test_id"])

        reviewer = random.choice(teacher_ids)
        review_status = random.choice(["Approved", "Drafted", "Needs revision"])
        review_comments = random.choice([
            "The pattern is worth continuing to monitor.",
            "Evidence is consistent but more observations would strengthen the picture.",
            "Good support for a follow-up discussion with the learner.",
            "This draft is cautious and grounded in the actual observations.",
        ])

        reviews.append(
            {
                "note_id": f"NOTE{note_index:03d}",
                "learner_id": learner_id,
                "evidence_ids": ", ".join(evidence_ids),
                "draft_text": f"There is emerging evidence that {learner_id} shows stronger collaboration and task persistence in structured activities. The pattern should be monitored, not treated as a fixed conclusion.",
                "reviewer_id": reviewer,
                "review_status": review_status,
                "reviewed_at": random_date(date(2025, 3, 1), date(2026, 9, 1)).isoformat(),
                "review_comments": review_comments,
            }
        )
        note_index += 1

    return reviews


def write_csv(path: Path, fieldnames: list[str], rows: list[dict]) -> None:
    with path.open("w", newline="", encoding="utf-8") as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key, "") for key in fieldnames})


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate the Dira hackathon synthetic dataset.")
    parser.add_argument("--learners", type=int, default=12, help="Number of learners to create")
    parser.add_argument("--academic-year", type=int, default=2026, help="Academic year for output records")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducible results")
    parser.add_argument("--output-dir", type=str, default="data/generated", help="Directory to write generated CSV files")
    parser.add_argument("--include-teacher-reviews", action="store_true", help="Also generate teacher_reviews.csv")
    parser.add_argument("--calendar-only", action="store_true", help="Generate only school_calendar.csv")
    parser.add_argument("--observations-only", action="store_true", help="Regenerate observations and school_calendar.csv using learners.csv already in the output directory")
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    calendar = generate_school_calendar(args.academic_year - 1, args.academic_year)
    write_csv(
        output_dir / "school_calendar.csv",
        [
            "calendar_entry_id",
            "calendar_date",
            "academic_year",
            "term",
            "year_group",
            "weekday",
            "period_number",
            "start_time",
            "end_time",
            "subject",
            "planned_activity",
            "event_name",
            "event_type",
        ],
        calendar,
    )

    if args.calendar_only:
        print(f"Generated school calendar in {output_dir}")
        print(f"calendar_entries={len(calendar)}")
        return

    teacher_ids = ["T001", "T002", "T003", "T004", "T005"]
    if args.observations_only:
        learners_path = output_dir / "learners.csv"
        with learners_path.open("r", newline="", encoding="utf-8") as csvfile:
            learners = list(csv.DictReader(csvfile))
    else:
        learners = generate_learners(args.learners, args.academic_year)

    observations, _ = generate_observations(learners, teacher_ids, calendar, args.seed)

    if not args.observations_only:
        write_csv(
            output_dir / "learners.csv",
            ["learner_id", "grade_level", "academic_year", "enrolment_status"],
            learners,
        )
    write_csv(
        output_dir / "observations.csv",
        [
            "observation_id",
            "learner_id",
            "observation_date",
            "term",
            "calendar_entry_id",
            "teacher_id",
            "activity_context",
            "original_observation",
            "source_type",
            "possible_theme",
            "verification_status",
        ],
        observations,
    )

    if args.observations_only:
        print(f"Generated observations and school calendar in {output_dir}")
        print(f"observations={len(observations)} calendar_entries={len(calendar)}")
        return

    tests = generate_activity_tests(learners, observations, teacher_ids, args.seed)
    write_csv(
        output_dir / "activity_tests.csv",
        [
            "test_id",
            "learner_id",
            "trigger_observation_ids",
            "suggested_activity",
            "activity_date",
            "conducting_teacher_id",
            "observed_outcome",
            "outcome_observation_id",
            "status",
        ],
        tests,
    )

    if args.include_teacher_reviews:
        reviews = generate_teacher_reviews(learners, observations, tests, teacher_ids)
        write_csv(
            output_dir / "teacher_reviews.csv",
            [
                "note_id",
                "learner_id",
                "evidence_ids",
                "draft_text",
                "reviewer_id",
                "review_status",
                "reviewed_at",
                "review_comments",
            ],
            reviews,
        )

    print(f"Generated dataset in {output_dir}")
    print(f"learners={len(learners)} observations={len(observations)} tests={len(tests)}")
    print(f"calendar_entries={len(calendar)}")


if __name__ == "__main__":
    main()
