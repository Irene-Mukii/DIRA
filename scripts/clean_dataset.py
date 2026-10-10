#!/usr/bin/env python3
"""Validate and copy generated synthetic CSVs without hiding bad references."""

from __future__ import annotations

import argparse
import csv
from pathlib import Path


REQUIRED_HEADERS = {
    "schools": ["school_id", "school_name"],
    "teachers": ["teacher_id", "school_id", "display_name"],
    "classes": ["class_id", "school_id", "grade_level", "stream_label", "academic_year"],
    "learners": ["learner_id", "display_name"],
    "learner_enrollments": [
        "learner_id",
        "class_id",
        "school_id",
        "academic_year",
        "enrolment_status",
        "enrolled_from",
        "enrolled_to",
    ],
    "timetable_assignments": [
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
    "school_calendar": [
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
    "attendance": [
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
    "observations": [
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
    "activity_tests": [
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
}
OPTIONAL_HEADERS = {
    "teacher_reviews": [
        "note_id",
        "learner_id",
        "evidence_ids",
        "draft_text",
        "reviewer_id",
        "review_status",
        "reviewed_at",
        "review_comments",
    ]
}


def resolve_path(path: Path) -> Path:
    if path.is_absolute():
        return path
    return Path(__file__).resolve().parents[1] / path


def read_rows(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open("r", newline="", encoding="utf-8-sig") as source:
        reader = csv.DictReader(source)
        headers = [header.strip() for header in (reader.fieldnames or [])]
        rows = [
            {key.strip(): (value or "").strip() for key, value in row.items() if key}
            for row in reader
        ]
    return headers, rows


def unique_index(rows: list[dict[str, str]], column: str, label: str, errors: list[str]) -> dict[str, dict[str, str]]:
    indexed: dict[str, dict[str, str]] = {}
    for line_number, row in enumerate(rows, start=2):
        key = row.get(column, "")
        if not key:
            errors.append(f"{label} row {line_number} has no {column}")
        elif key in indexed:
            errors.append(f"{label} has duplicate {column} {key}")
        else:
            indexed[key] = row
    return indexed


def check_reference(condition: bool, message: str, errors: list[str]) -> None:
    if not condition:
        errors.append(message)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", type=Path, default=Path("data/generated_dev"))
    parser.add_argument("--output-dir", type=Path, default=Path("data/cleaned/generated_dev"))
    args = parser.parse_args()
    input_dir = resolve_path(args.input_dir)
    output_dir = resolve_path(args.output_dir)
    errors: list[str] = []
    datasets: dict[str, list[dict[str, str]]] = {}
    headers_by_name: dict[str, list[str]] = {}

    for name, required_headers in REQUIRED_HEADERS.items():
        path = input_dir / f"{name}.csv"
        if not path.exists():
            errors.append(f"Missing required file: {path.name}")
            continue
        headers, rows = read_rows(path)
        missing_headers = [header for header in required_headers if header not in headers]
        if missing_headers:
            errors.append(f"{path.name} is missing columns: {', '.join(missing_headers)}")
        datasets[name] = rows
        headers_by_name[name] = headers

    for name, expected_headers in OPTIONAL_HEADERS.items():
        path = input_dir / f"{name}.csv"
        if path.exists():
            headers, rows = read_rows(path)
            missing_headers = [header for header in expected_headers if header not in headers]
            if missing_headers:
                errors.append(f"{path.name} is missing columns: {', '.join(missing_headers)}")
            datasets[name] = rows
            headers_by_name[name] = headers

    if errors:
        raise SystemExit("\n".join(errors))

    schools = unique_index(datasets["schools"], "school_id", "schools", errors)
    teachers = unique_index(datasets["teachers"], "teacher_id", "teachers", errors)
    classes = unique_index(datasets["classes"], "class_id", "classes", errors)
    learners = unique_index(datasets["learners"], "learner_id", "learners", errors)
    enrollments = {
        (row["learner_id"], row["class_id"], row["academic_year"]): row
        for row in datasets["learner_enrollments"]
    }
    assignments = unique_index(
        datasets["timetable_assignments"],
        "timetable_assignment_id",
        "timetable_assignments",
        errors,
    )
    calendar = unique_index(
        datasets["school_calendar"], "calendar_entry_id", "school_calendar", errors
    )
    observations = unique_index(
        datasets["observations"], "observation_id", "observations", errors
    )
    tests = unique_index(datasets["activity_tests"], "test_id", "activity_tests", errors)
    reviews = (
        unique_index(datasets["teacher_reviews"], "note_id", "teacher_reviews", errors)
        if "teacher_reviews" in datasets
        else {}
    )

    for row in datasets["teachers"]:
        check_reference(row["school_id"] in schools, f"Teacher {row['teacher_id']} has unknown school", errors)
    seen_classes: set[tuple[str, str, str, str]] = set()
    for row in datasets["classes"]:
        check_reference(row["school_id"] in schools, f"Class {row['class_id']} has unknown school", errors)
        key = (row["school_id"], row["grade_level"], row["stream_label"], row["academic_year"])
        check_reference(key not in seen_classes, f"Duplicate class {key}", errors)
        seen_classes.add(key)
    seen_enrollments: set[tuple[str, str, str]] = set()
    seen_learner_years: set[tuple[str, str]] = set()
    for row in datasets["learner_enrollments"]:
        key = (row["learner_id"], row["class_id"], row["academic_year"])
        learner_year = (row["learner_id"], row["academic_year"])
        class_row = classes.get(row["class_id"])
        check_reference(row["learner_id"] in learners, f"Enrollment {key} has unknown learner", errors)
        check_reference(
            class_row is not None
            and class_row["school_id"] == row["school_id"]
            and class_row["academic_year"] == row["academic_year"],
            f"Enrollment {key} has inconsistent class/school/year",
            errors,
        )
        check_reference(key not in seen_enrollments, f"Duplicate enrollment {key}", errors)
        check_reference(
            learner_year not in seen_learner_years,
            f"Learner {row['learner_id']} has more than one enrollment in {row['academic_year']}",
            errors,
        )
        seen_enrollments.add(key)
        seen_learner_years.add(learner_year)

    class_periods: set[tuple[str, str, str, str]] = set()
    teacher_periods: set[tuple[str, str, str, str]] = set()
    for row in datasets["timetable_assignments"]:
        assignment_id = row["timetable_assignment_id"]
        class_row = classes.get(row["class_id"])
        teacher = teachers.get(row["teacher_id"])
        check_reference(
            class_row is not None
            and class_row["school_id"] == row["school_id"]
            and class_row["academic_year"] == row["academic_year"],
            f"Timetable assignment {assignment_id} has inconsistent class/school/year",
            errors,
        )
        check_reference(
            teacher is not None and teacher["school_id"] == row["school_id"],
            f"Timetable assignment {assignment_id} has inconsistent teacher/school",
            errors,
        )
        class_slot = (row["class_id"], row["academic_year"], row["weekday"], row["period_number"])
        teacher_slot = (row["teacher_id"], row["academic_year"], row["weekday"], row["period_number"])
        check_reference(class_slot not in class_periods, f"Class timetable collision at {class_slot}", errors)
        check_reference(teacher_slot not in teacher_periods, f"Teacher timetable collision at {teacher_slot}", errors)
        class_periods.add(class_slot)
        teacher_periods.add(teacher_slot)

    calendar_slots: set[tuple[str, str, str]] = set()
    for row in datasets["school_calendar"]:
        assignment = assignments.get(row["timetable_assignment_id"])
        slot = (row["calendar_date"], row["class_id"], row["period_number"])
        check_reference(slot not in calendar_slots, f"Duplicate calendar period {slot}", errors)
        calendar_slots.add(slot)
        check_reference(
            assignment is not None
            and all(
                assignment[field] == row[field]
                for field in ("school_id", "class_id", "teacher_id", "academic_year", "weekday", "period_number", "start_time", "end_time", "subject")
            ),
            f"Calendar entry {row['calendar_entry_id']} does not match its timetable assignment",
            errors,
        )
        check_reference(
            row["school_id"] in schools
            and row["class_id"] in classes
            and row["teacher_id"] in teachers
            and row["academic_year"] == row["calendar_date"][:4],
            f"Calendar entry {row['calendar_entry_id']} has invalid school/class/teacher/year",
            errors,
        )

    attendance_slots: set[tuple[str, str]] = set()
    for row in datasets["attendance"]:
        enrollment_key = (row["learner_id"], row["class_id"], row["academic_year"])
        session = calendar.get(row["calendar_entry_id"])
        slot = (row["learner_id"], row["calendar_entry_id"])
        check_reference(slot not in attendance_slots, f"Duplicate learner attendance period {slot}", errors)
        attendance_slots.add(slot)
        check_reference(enrollment_key in enrollments, f"Attendance {row['attendance_id']} has no learner enrollment", errors)
        check_reference(
            session is not None
            and session["class_id"] == row["class_id"]
            and session["academic_year"] == row["academic_year"]
            and session["calendar_date"] == row["calendar_date"],
            f"Attendance {row['attendance_id']} has no matching scheduled period",
            errors,
        )
        check_reference(row["status"] in {"present", "late", "absent", "excused", "unknown"}, f"Attendance {row['attendance_id']} has invalid status", errors)
        check_reference(row["recorded_by_teacher_id"] in teachers, f"Attendance {row['attendance_id']} has unknown teacher", errors)

    submission_ids: set[str] = set()
    allowed_observation_types = {
        "participation", "academic", "behavioral", "attendance",
        "extracurricular", "test_result", "other",
    }
    allowed_capture_methods = {"text", "in_app_voice", "basic_phone_callback", "other"}
    allowed_source_types = {
        "Voice transcription", "Text note", "Phone callback", "Teacher chat",
    }
    allowed_verification_statuses = {
        "Pending", "Needs more evidence", "Repeated pattern",
        "Verified by multiple teachers", "Inconclusive",
    }
    for row in datasets["observations"]:
        enrollment_key = (row["learner_id"], row["class_id"], row["academic_year"])
        enrollment = enrollments.get(enrollment_key)
        session_id = row["calendar_entry_id"]
        session = calendar.get(session_id) if session_id else None
        check_reference(
            enrollment is not None and enrollment["school_id"] == row["school_id"],
            f"Observation {row['observation_id']} has no matching school enrollment",
            errors,
        )
        check_reference(
            row["teacher_id"] in teachers
            and teachers[row["teacher_id"]]["school_id"] == row["school_id"],
            f"Observation {row['observation_id']} has invalid teacher/school",
            errors,
        )
        if session_id:
            check_reference(
                session is not None
                and session["class_id"] == row["class_id"]
                and session["school_id"] == row["school_id"]
                and session["teacher_id"] == row["teacher_id"]
                and session["calendar_date"] == row["observation_date"]
                and session["academic_year"] == row["academic_year"],
                f"Observation {row['observation_id']} has invalid scheduled period",
                errors,
            )
        check_reference(row["observation_type"] in allowed_observation_types, f"Observation {row['observation_id']} has invalid type", errors)
        check_reference(row["capture_method"] in allowed_capture_methods, f"Observation {row['observation_id']} has invalid capture method", errors)
        check_reference(row["source_type"] in allowed_source_types, f"Observation {row['observation_id']} has invalid source type", errors)
        check_reference(row["verification_status"] in allowed_verification_statuses, f"Observation {row['observation_id']} has invalid verification status", errors)
        linked_test_id = row["linked_test_id"]
        if linked_test_id:
            linked_test = tests.get(linked_test_id)
            check_reference(
                linked_test is not None and linked_test["learner_id"] == row["learner_id"],
                f"Observation {row['observation_id']} has invalid linked test",
                errors,
            )
        submission_id = row["submission_id"]
        check_reference(bool(submission_id) and submission_id not in submission_ids, f"Observation {row['observation_id']} has duplicate/empty submission ID", errors)
        submission_ids.add(submission_id)
        check_reference(bool(row["original_observation"].strip()), f"Observation {row['observation_id']} has empty text", errors)

    for row in datasets["activity_tests"]:
        learner_id = row["learner_id"]
        teacher = teachers.get(row["conducting_teacher_id"])
        check_reference(learner_id in learners, f"Test {row['test_id']} has unknown learner", errors)
        check_reference(teacher is not None, f"Test {row['test_id']} has unknown teacher", errors)
        check_reference(
            row["status"] in {"Completed", "In progress", "Pending"},
            f"Test {row['test_id']} has invalid status",
            errors,
        )
        for observation_id in filter(None, (part.strip() for part in row["trigger_observation_ids"].split(","))):
            observation = observations.get(observation_id)
            check_reference(
                observation is not None and observation["learner_id"] == learner_id,
                f"Test {row['test_id']} has invalid trigger observation {observation_id}",
                errors,
            )
        outcome_id = row["outcome_observation_id"]
        if row["status"] == "Completed":
            outcome = observations.get(outcome_id)
            check_reference(
                outcome is not None and outcome["learner_id"] == learner_id,
                f"Completed test {row['test_id']} has no valid outcome observation",
                errors,
            )

    for row in datasets.get("teacher_reviews", []):
        check_reference(row["learner_id"] in learners, f"Review {row['note_id']} has unknown learner", errors)
        check_reference(row["reviewer_id"] in teachers, f"Review {row['note_id']} has unknown reviewer", errors)
        check_reference(
            row["review_status"] in {"Approved", "Drafted", "Needs revision"},
            f"Review {row['note_id']} has invalid status",
            errors,
        )
        for evidence_id in filter(None, (part.strip() for part in row["evidence_ids"].split(","))):
            evidence = observations.get(evidence_id) or tests.get(evidence_id)
            check_reference(
                evidence is not None and evidence["learner_id"] == row["learner_id"],
                f"Review {row['note_id']} has invalid evidence {evidence_id}",
                errors,
            )

    if errors:
        raise SystemExit("Dataset validation failed:\n- " + "\n- ".join(errors[:100]))

    output_dir.mkdir(parents=True, exist_ok=True)
    for name, rows in datasets.items():
        with (output_dir / f"{name}.csv").open("w", newline="", encoding="utf-8") as target:
            writer = csv.DictWriter(target, fieldnames=headers_by_name[name])
            writer.writeheader()
            writer.writerows(rows)

    print(f"Validated {len(datasets)} CSV files from {input_dir}")
    for name, rows in datasets.items():
        print(f"{name}: {len(rows)} rows")
    print(f"Cleaned files written to {output_dir}")


if __name__ == "__main__":
    main()
