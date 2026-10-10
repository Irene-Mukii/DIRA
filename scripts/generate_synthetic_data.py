#!/usr/bin/env python3
"""Generate reproducible synthetic school, timetable, attendance, and evidence CSVs."""

from __future__ import annotations

import argparse
import csv
import random
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path


SCHOOL_ID = "SCH001"
GRADES = ("Grade 4", "Grade 5", "Grade 6")
PERIODS = (
    (1, "08:45", "09:45"),
    (2, "09:45", "10:45"),
    (3, "11:15", "12:15"),
    (4, "13:00", "14:00"),
    (5, "14:00", "15:00"),
)
SUBJECTS = {
    "Grade 4": ("Mathematics", "English", "Science", "Humanities", "Arts"),
    "Grade 5": ("Mathematics", "English", "Science", "Humanities", "Health and Physical Education"),
    "Grade 6": ("Mathematics", "English", "Science", "Humanities", "Design and Technology"),
}
ACTIVITIES = (
    "Unassigned group-leadership task",
    "Pair reading with turn-taking roles",
    "Short collaborative puzzle challenge",
    "Teacher-guided checklist task",
    "Small-group problem solving without assigned leader",
    "Role-reversal explanation task",
)
OBSERVATIONS = (
    "Helped peers divide tasks and stayed focused on the group goal.",
    "Needed a second explanation but then completed the task correctly.",
    "Asked a clarifying question before starting and worked independently.",
    "Was quiet at first but contributed to the discussion once prompted.",
    "Completed the task quickly but needed support to explain the reasoning.",
    "Kept re-engaging after distraction and eventually finished the task.",
    "Worked well with a partner and encouraged another learner to continue.",
    "Struggled to start, then improved after a short teacher check-in.",
)
THEMES = (
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
)
VERIFICATION_STATUSES = (
    "Pending",
    "Needs more evidence",
    "Repeated pattern",
    "Verified by multiple teachers",
    "Inconclusive",
)
SOURCES = {
    "Voice transcription": "in_app_voice",
    "Text note": "text",
    "Phone callback": "basic_phone_callback",
    "Teacher chat": "other",
}


def write_csv(path: Path, fieldnames: list[str], rows: list[dict]) -> None:
    with path.open("w", newline="", encoding="utf-8") as output:
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def term_for_date(value: date) -> str:
    if value.month <= 3:
        return "Term 1"
    if value.month <= 6:
        return "Term 2"
    if value.month <= 9:
        return "Term 3"
    return "Term 4"


def event_for_date(value: date) -> tuple[str, str]:
    if value.month == 5 and value.day <= 5:
        return "Mathematics Week", "Curriculum week"
    if value.month == 2 and value.day <= 5:
        return "Reading Week", "Curriculum week"
    if value.month == 9 and value.weekday() == 4 and 8 <= value.day <= 14:
        return "Science Fair", "School event"
    if value.month == 11 and value.weekday() == 4 and 15 <= value.day <= 21:
        return "Sports Day", "School event"
    return "", ""


def make_school() -> list[dict]:
    return [{"school_id": SCHOOL_ID, "school_name": "DIRA Synthetic Demonstration School"}]


def make_teachers() -> list[dict]:
    return [
        {
            "teacher_id": f"T{number:03d}",
            "school_id": SCHOOL_ID,
            "display_name": f"Synthetic Teacher {number:02d}",
        }
        for number in range(1, 13)
    ]


def make_classes(first_year: int, last_year: int, streams_per_grade: int) -> list[dict]:
    return [
        {
            "class_id": f"C{year}-{grade.replace(' ', '')}-{chr(65 + stream)}",
            "school_id": SCHOOL_ID,
            "grade_level": grade,
            "stream_label": chr(65 + stream),
            "academic_year": year,
        }
        for year in range(first_year, last_year + 1)
        for grade in GRADES
        for stream in range(streams_per_grade)
    ]


def make_learners(count: int, streams_per_grade: int) -> tuple[list[dict], list[dict]]:
    learners = []
    enrollments = []
    grade_cycle = ("Grade 4", "Grade 4", "Grade 5", "Grade 5", "Grade 6", "Grade 6")
    statuses = ("Active", "Active", "At risk", "Active", "Active", "Transitioning")
    for index in range(count):
        learner_id = f"L{index + 1:03d}"
        grade = grade_cycle[index % len(grade_cycle)]
        stream = chr(65 + (index // len(grade_cycle)) % streams_per_grade)
        learners.append(
            {"learner_id": learner_id, "display_name": f"Synthetic Learner {index + 1:03d}"}
        )
        for year in (2025, 2026):
            enrollments.append(
                {
                    "learner_id": learner_id,
                    "class_id": f"C{year}-{grade.replace(' ', '')}-{stream}",
                    "school_id": SCHOOL_ID,
                    "academic_year": year,
                    "enrolment_status": statuses[index % len(statuses)],
                    "enrolled_from": f"{year}-01-01",
                    "enrolled_to": f"{year}-12-31",
                }
            )
    return learners, enrollments


def make_timetable(classes: list[dict], teachers: list[dict]) -> list[dict]:
    teacher_ids = [teacher["teacher_id"] for teacher in teachers]
    assignments = []
    for class_index, class_row in enumerate(classes):
        academic_year = class_row["academic_year"]
        for weekday in range(1, 6):
            for period_number, start_time, end_time in PERIODS:
                subject_list = SUBJECTS[class_row["grade_level"]]
                subject = subject_list[(weekday + period_number - 2) % len(subject_list)]
                teacher_index = (class_index % 6 + weekday + period_number) % len(teacher_ids)
                assignments.append(
                    {
                        "timetable_assignment_id": (
                            f"TA-{class_row['class_id']}-W{weekday}-P{period_number}"
                        ),
                        "school_id": class_row["school_id"],
                        "class_id": class_row["class_id"],
                        "teacher_id": teacher_ids[teacher_index],
                        "academic_year": academic_year,
                        "weekday": weekday,
                        "period_number": period_number,
                        "start_time": start_time,
                        "end_time": end_time,
                        "subject": subject,
                        "valid_from": f"{academic_year}-01-01",
                        "valid_to": f"{academic_year}-12-31",
                    }
                )
    return assignments


def make_school_calendar(
    assignments: list[dict], first_year: int, last_year: int
) -> list[dict]:
    assignments_by_weekday: dict[tuple[int, int], list[dict]] = {}
    for assignment in assignments:
        key = (assignment["academic_year"], assignment["weekday"])
        assignments_by_weekday.setdefault(key, []).append(assignment)

    rows = []
    entry_number = 1
    current = date(first_year, 1, 1)
    end = date(last_year, 12, 31)
    while current <= end:
        if current.weekday() < 5:
            for assignment in assignments_by_weekday.get(
                (current.year, current.isoweekday()), []
            ):
                event_name, event_type = event_for_date(current)
                planned_activity = ""
                if event_name == "Mathematics Week" and assignment["subject"] == "Mathematics":
                    planned_activity = "Collaborative mathematics challenge"
                elif event_name == "Reading Week" and assignment["subject"] == "English":
                    planned_activity = "Collaborative reading activity"
                rows.append(
                    {
                        "calendar_entry_id": f"CAL{entry_number:06d}",
                        "school_id": assignment["school_id"],
                        "class_id": assignment["class_id"],
                        "teacher_id": assignment["teacher_id"],
                        "timetable_assignment_id": assignment["timetable_assignment_id"],
                        "calendar_date": current.isoformat(),
                        "academic_year": current.year,
                        "term": term_for_date(current),
                        "weekday": current.isoweekday(),
                        "period_number": assignment["period_number"],
                        "start_time": assignment["start_time"],
                        "end_time": assignment["end_time"],
                        "subject": assignment["subject"],
                        "planned_activity": planned_activity,
                        "event_name": event_name,
                        "event_type": event_type,
                    }
                )
                entry_number += 1
        current += timedelta(days=1)
    return rows


def attendance_status(rng: random.Random, learner_number: int, session_index: int) -> str | None:
    pattern = learner_number % 5
    if pattern == 0:
        weights = (0.93, 0.04, 0.01, 0.01, 0.01)
    elif pattern == 1:
        weights = (0.78, 0.10, 0.08, 0.03, 0.01)
    elif pattern == 2:
        weights = (0.57, 0.09, 0.25, 0.07, 0.02)
    elif pattern == 3:
        if rng.random() < 0.18:
            return None
        weights = (0.80, 0.09, 0.06, 0.03, 0.02)
    else:
        in_absence_cluster = 35 <= session_index % 90 <= 44
        weights = (
            (0.25, 0.10, 0.55, 0.08, 0.02)
            if in_absence_cluster
            else (0.84, 0.08, 0.05, 0.02, 0.01)
        )
    return rng.choices(
        ("present", "late", "absent", "excused", "unknown"),
        weights=weights,
        k=1,
    )[0]


def make_attendance(
    enrollments: list[dict], calendar: list[dict], seed: int
) -> list[dict]:
    rng = random.Random(seed + 1)
    sessions_by_class: dict[str, list[dict]] = {}
    for session in calendar:
        sessions_by_class.setdefault(session["class_id"], []).append(session)

    rows = []
    sequence = 1
    for enrollment in enrollments:
        learner_number = int(enrollment["learner_id"][1:])
        sessions = sessions_by_class[enrollment["class_id"]]
        for session_index, session in enumerate(sessions):
            status = attendance_status(rng, learner_number, session_index)
            if status is None:
                continue
            starts_at = datetime.combine(
                date.fromisoformat(session["calendar_date"]),
                time.fromisoformat(session["start_time"]),
                tzinfo=timezone.utc,
            )
            rows.append(
                {
                    "attendance_id": f"ATT{sequence:08d}",
                    "learner_id": enrollment["learner_id"],
                    "class_id": enrollment["class_id"],
                    "academic_year": enrollment["academic_year"],
                    "calendar_entry_id": session["calendar_entry_id"],
                    "calendar_date": session["calendar_date"],
                    "status": status,
                    "recorded_at": starts_at.isoformat(),
                    "recorded_by_teacher_id": session["teacher_id"],
                    "source": "teacher_register",
                    "note": "",
                }
            )
            sequence += 1
    return rows


def make_observation(
    observation_id: str,
    learner_id: str,
    session: dict,
    rng: random.Random,
    *,
    content: str | None = None,
    observation_type: str | None = None,
) -> dict:
    source_type = rng.choice(tuple(SOURCES))
    return {
        "observation_id": observation_id,
        "learner_id": learner_id,
        "teacher_id": session["teacher_id"],
        "school_id": session["school_id"],
        "class_id": session["class_id"],
        "academic_year": session["academic_year"],
        "observation_date": session["calendar_date"],
        "observed_at": datetime.combine(
            date.fromisoformat(session["calendar_date"]),
            time.fromisoformat(session["start_time"]),
            tzinfo=timezone.utc,
        ).isoformat(),
        "term": session["term"],
        "calendar_entry_id": session["calendar_entry_id"],
        "observation_type": observation_type or rng.choice(
            ("participation", "academic", "behavioral", "extracurricular", "other")
        ),
        "original_observation": content or rng.choice(OBSERVATIONS),
        "subject": session["subject"],
        "activity_context": rng.choice(
            ("Group project", "Whole-class discussion", "Independent task", "Pair work", "Practical activity")
        ),
        "source_type": source_type,
        "capture_method": SOURCES[source_type],
        "possible_theme": rng.choice(THEMES),
        "verification_status": rng.choice(VERIFICATION_STATUSES),
        "submission_id": f"seed-{observation_id}",
        "linked_test_id": "",
    }


def make_observations(
    enrollments: list[dict], calendar: list[dict], seed: int
) -> tuple[list[dict], dict[tuple[str, str], list[str]]]:
    rng = random.Random(seed)
    sessions_by_class: dict[str, list[dict]] = {}
    for session in calendar:
        sessions_by_class.setdefault(session["class_id"], []).append(session)
    rows = []
    learner_observation_ids: dict[tuple[str, str], list[str]] = {}

    for enrollment in enrollments:
        learner_id = enrollment["learner_id"]
        enrollment_key = (learner_id, enrollment["class_id"])
        sessions = sessions_by_class[enrollment["class_id"]]
        for _ in range(rng.randint(2, 4)):
            session = rng.choice(sessions)
            observation_id = f"OBS{len(rows) + 1:06d}"
            rows.append(make_observation(observation_id, learner_id, session, rng))
            learner_observation_ids.setdefault(enrollment_key, []).append(observation_id)
    return rows, learner_observation_ids


def make_tests(
    enrollments: list[dict],
    calendar: list[dict],
    observations: list[dict],
    learner_observation_ids: dict[tuple[str, str], list[str]],
    seed: int,
) -> tuple[list[dict], list[dict]]:
    rng = random.Random(seed + 10)
    sessions_by_class: dict[str, list[dict]] = {}
    for session in calendar:
        sessions_by_class.setdefault(session["class_id"], []).append(session)
    tests = []
    outcome_observations = []
    for enrollment in enrollments:
        learner_id = enrollment["learner_id"]
        if rng.random() >= 0.45:
            continue
        learner_sessions = sessions_by_class[enrollment["class_id"]]
        for _ in range(rng.randint(1, 2)):
            session = rng.choice(learner_sessions)
            status = rng.choice(("Completed", "In progress", "Pending"))
            test_id = f"TEST{len(tests) + 1:06d}"
            outcome_observation_id = ""
            observed_outcome = ""
            if status == "Completed":
                outcome_observation_id = f"OBS{len(observations) + len(outcome_observations) + 1:06d}"
                observed_outcome = rng.choice(
                    (
                        "Completed the task with fewer prompts and explained the final answer.",
                        "Participated more confidently in the group activity.",
                        "Needed support at the start but recovered after a short check-in.",
                    )
                )
                outcome_observations.append(
                    make_observation(
                        outcome_observation_id,
                        learner_id,
                        session,
                        rng,
                        content=observed_outcome,
                        observation_type="test_result",
                    )
                )
            enrollment_key = (learner_id, enrollment["class_id"])
            learner_observations = learner_observation_ids.get(enrollment_key, [])
            trigger_ids = rng.sample(
                learner_observations,
                k=min(2, len(learner_observations)),
            )
            tests.append(
                {
                    "test_id": test_id,
                    "learner_id": learner_id,
                    "trigger_observation_ids": ", ".join(trigger_ids),
                    "suggested_activity": rng.choice(ACTIVITIES),
                    "activity_date": session["calendar_date"],
                    "conducting_teacher_id": session["teacher_id"],
                    "observed_outcome": observed_outcome,
                    "outcome_observation_id": outcome_observation_id,
                    "status": status,
                }
            )
    return tests, outcome_observations


def make_teacher_reviews(
    enrollments: list[dict],
    teachers: list[dict],
    learner_observation_ids: dict[tuple[str, str], list[str]],
    tests: list[dict],
    seed: int,
) -> list[dict]:
    rng = random.Random(seed + 20)
    teacher_ids = [teacher["teacher_id"] for teacher in teachers]
    reviews = []
    for enrollment in enrollments:
        learner_id = enrollment["learner_id"]
        learner_tests = [test for test in tests if test["learner_id"] == learner_id]
        learner_obs = learner_observation_ids.get((learner_id, enrollment["class_id"]), [])
        if not learner_obs and not learner_tests:
            continue
        note_id = f"NOTE{len(reviews) + 1:06d}"
        evidence_ids = learner_obs[:3] + [test["test_id"] for test in learner_tests[:1]]
        reviews.append(
            {
                "note_id": note_id,
                "learner_id": learner_id,
                "evidence_ids": ", ".join(evidence_ids),
                "draft_text": (
                    f"There is emerging evidence that {learner_id} shows stronger "
                    "collaboration and task persistence in structured activities. "
                    "The pattern should be monitored, not treated as a fixed conclusion."
                ),
                "reviewer_id": rng.choice(teacher_ids),
                "review_status": rng.choice(("Approved", "Drafted", "Needs revision")),
                "reviewed_at": f"{enrollment['academic_year']}-09-01",
                "review_comments": "Synthetic review; evidence should be interpreted cautiously.",
            }
        )
    return reviews


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a DIRA synthetic school dataset.")
    parser.add_argument("--learners", type=int, default=50)
    parser.add_argument("--academic-year", type=int, default=2026)
    parser.add_argument("--streams-per-grade", type=int, default=2)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--output-dir", type=Path, default=Path("data/generated_dev"))
    parser.add_argument("--include-teacher-reviews", action="store_true")
    args = parser.parse_args()
    if args.learners < 1 or not 1 <= args.streams_per_grade <= 26:
        parser.error("--learners must be positive and --streams-per-grade must be 1-26")

    first_year = args.academic_year - 1
    last_year = args.academic_year
    args.output_dir.mkdir(parents=True, exist_ok=True)

    schools = make_school()
    teachers = make_teachers()
    classes = make_classes(first_year, last_year, args.streams_per_grade)
    learners, enrollments = make_learners(args.learners, args.streams_per_grade)
    assignments = make_timetable(classes, teachers)
    calendar = make_school_calendar(assignments, first_year, last_year)
    attendance = make_attendance(enrollments, calendar, args.seed)
    observations, learner_observation_ids = make_observations(enrollments, calendar, args.seed)
    tests, outcome_observations = make_tests(
        enrollments, calendar, observations, learner_observation_ids, args.seed
    )
    all_observations = observations + outcome_observations

    datasets: dict[str, tuple[list[str], list[dict]]] = {
        "schools": (["school_id", "school_name"], schools),
        "teachers": (["teacher_id", "school_id", "display_name"], teachers),
        "classes": (
            ["class_id", "school_id", "grade_level", "stream_label", "academic_year"],
            classes,
        ),
        "learners": (["learner_id", "display_name"], learners),
        "learner_enrollments": (
            [
                "learner_id",
                "class_id",
                "school_id",
                "academic_year",
                "enrolment_status",
                "enrolled_from",
                "enrolled_to",
            ],
            enrollments,
        ),
        "timetable_assignments": (
            [
                "timetable_assignment_id",
                "school_id",
                "class_id",
                "teacher_id",
                "academic_year",
                "weekday",
                "period_number",
                "start_time",
                "end_time",
                "subject",
                "valid_from",
                "valid_to",
            ],
            assignments,
        ),
        "school_calendar": (
            [
                "calendar_entry_id",
                "school_id",
                "class_id",
                "teacher_id",
                "timetable_assignment_id",
                "calendar_date",
                "academic_year",
                "term",
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
        ),
        "attendance": (
            [
                "attendance_id",
                "learner_id",
                "class_id",
                "academic_year",
                "calendar_entry_id",
                "calendar_date",
                "status",
                "recorded_at",
                "recorded_by_teacher_id",
                "source",
                "note",
            ],
            attendance,
        ),
        "observations": (
            [
                "observation_id",
                "learner_id",
                "teacher_id",
                "school_id",
                "class_id",
                "academic_year",
                "observation_date",
                "observed_at",
                "term",
                "calendar_entry_id",
                "observation_type",
                "original_observation",
                "subject",
                "activity_context",
                "source_type",
                "capture_method",
                "possible_theme",
                "verification_status",
                "submission_id",
                "linked_test_id",
            ],
            all_observations,
        ),
        "activity_tests": (
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
        ),
    }
    for name, (fields, rows) in datasets.items():
        write_csv(args.output_dir / f"{name}.csv", fields, rows)

    if args.include_teacher_reviews:
        reviews = make_teacher_reviews(
            enrollments, teachers, learner_observation_ids, tests, args.seed
        )
        write_csv(
            args.output_dir / "teacher_reviews.csv",
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
    print(
        f"Generated {len(learners)} learners, {len(classes)} classes, "
        f"{len(calendar)} scheduled periods, {len(attendance)} attendance records, "
        f"{len(all_observations)} observations, and {len(tests)} tests in {args.output_dir}"
    )


if __name__ == "__main__":
    main()
