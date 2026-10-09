#!/usr/bin/env python3
"""Clean the generated Dira demo dataset.

This script is intentionally separate from data generation. It validates the
synthetic CSVs created by the generator, normalises obvious formatting issues,
and checks that the main references are internally consistent before the dataset
is used for demo, evaluation, or downstream analysis.

Expected input folder structure:
    data/generated_scale_50/
      learners.csv
      observations.csv
      activity_tests.csv
      teacher_reviews.csv (optional)

Outputs are written to a separate cleaned folder, leaving the source files intact.
"""

from __future__ import annotations

import argparse
import csv
from pathlib import Path


def resolve_path(raw_path: str) -> Path:
    path = Path(raw_path)
    if path.is_absolute():
        return path

    script_dir = Path(__file__).resolve().parent
    repo_root = script_dir.parent
    candidates = [
        repo_root / raw_path,
        script_dir / raw_path,
        Path.cwd() / raw_path,
    ]

    for candidate in candidates:
        if candidate.exists():
            return candidate

    return repo_root / raw_path


def read_csv_rows(path: Path) -> list[dict]:
    with path.open("r", newline="", encoding="utf-8") as csvfile:
        reader = csv.DictReader(csvfile)
        rows = []
        for raw in reader:
            cleaned = {}
            for key, value in raw.items():
                cleaned[(key or "").strip()] = (value or "").strip()
            rows.append(cleaned)
    return rows


def write_csv_rows(path: Path, fieldnames: list[str], rows: list[dict]) -> None:
    with path.open("w", newline="", encoding="utf-8") as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key, "") for key in fieldnames})


def clean_learners(rows: list[dict]) -> list[dict]:
    cleaned: list[dict] = []
    seen: set[str] = set()

    for row in rows:
        learner_id = (row.get("learner_id") or "").strip()
        if not learner_id:
            continue
        if learner_id in seen:
            continue
        seen.add(learner_id)

        cleaned.append(
            {
                "learner_id": learner_id,
                "grade_level": row.get("grade_level") or "Unknown",
                "academic_year": row.get("academic_year") or "2026",
                "enrolment_status": row.get("enrolment_status") or "Unknown",
            }
        )

    cleaned.sort(key=lambda item: item["learner_id"])
    return cleaned


def clean_observations(rows: list[dict], valid_learner_ids: set[str]) -> list[dict]:
    cleaned: list[dict] = []
    seen: set[str] = set()

    for row in rows:
        observation_id = (row.get("observation_id") or "").strip()
        learner_id = (row.get("learner_id") or "").strip()
        if not observation_id or not learner_id:
            continue
        if learner_id not in valid_learner_ids:
            continue
        if observation_id in seen:
            continue
        seen.add(observation_id)

        cleaned.append(
            {
                "observation_id": observation_id,
                "learner_id": learner_id,
                "observation_date": row.get("observation_date") or "Unknown",
                "term": row.get("term") or "Unknown",
                "teacher_id": row.get("teacher_id") or "Unknown",
                "activity_context": row.get("activity_context") or "Unspecified",
                "original_observation": row.get("original_observation") or "No observation text provided.",
                "source_type": row.get("source_type") or "Text note",
                "possible_theme": row.get("possible_theme") or "Unspecified",
                "verification_status": row.get("verification_status") or "Pending",
            }
        )

    cleaned.sort(key=lambda item: (item["learner_id"], item["observation_id"]))
    return cleaned


def clean_activity_tests(rows: list[dict], valid_learner_ids: set[str], valid_observation_ids: set[str]) -> list[dict]:
    cleaned: list[dict] = []
    seen: set[str] = set()

    for row in rows:
        test_id = (row.get("test_id") or "").strip()
        learner_id = (row.get("learner_id") or "").strip()
        if not test_id or not learner_id:
            continue
        if learner_id not in valid_learner_ids:
            continue
        if test_id in seen:
            continue
        seen.add(test_id)

        raw_trigger_ids = (row.get("trigger_observation_ids") or "")
        valid_trigger_ids = []
        for token in raw_trigger_ids.replace(";", ",").split(","):
            candidate = token.strip()
            if candidate and candidate in valid_observation_ids:
                valid_trigger_ids.append(candidate)

        status = (row.get("status") or "Pending").strip() or "Pending"
        observed_outcome = (row.get("observed_outcome") or "").strip()
        outcome_observation_id = (row.get("outcome_observation_id") or "").strip()
        if outcome_observation_id and outcome_observation_id not in valid_observation_ids:
            outcome_observation_id = ""
        if status != "Completed" and outcome_observation_id:
            outcome_observation_id = ""
        if status == "Completed" and not observed_outcome:
            observed_outcome = "Outcome recorded without detailed narrative."

        cleaned.append(
            {
                "test_id": test_id,
                "learner_id": learner_id,
                "trigger_observation_ids": ", ".join(valid_trigger_ids),
                "suggested_activity": row.get("suggested_activity") or "Unspecified activity",
                "activity_date": row.get("activity_date") or "Unknown",
                "conducting_teacher_id": row.get("conducting_teacher_id") or "Unknown",
                "observed_outcome": observed_outcome,
                "outcome_observation_id": outcome_observation_id,
                "status": status,
            }
        )

    cleaned.sort(key=lambda item: (item["learner_id"], item["test_id"]))
    return cleaned


def clean_teacher_reviews(rows: list[dict], valid_learner_ids: set[str]) -> list[dict]:
    cleaned: list[dict] = []
    seen: set[str] = set()

    for row in rows:
        note_id = (row.get("note_id") or "").strip()
        learner_id = (row.get("learner_id") or "").strip()
        if not note_id or not learner_id:
            continue
        if learner_id not in valid_learner_ids:
            continue
        if note_id in seen:
            continue
        seen.add(note_id)

        cleaned.append(
            {
                "note_id": note_id,
                "learner_id": learner_id,
                "evidence_ids": row.get("evidence_ids") or "",
                "draft_text": row.get("draft_text") or "No draft text recorded.",
                "reviewer_id": row.get("reviewer_id") or "Unknown",
                "review_status": row.get("review_status") or "Drafted",
                "reviewed_at": row.get("reviewed_at") or "Unknown",
                "review_comments": row.get("review_comments") or "No review comments.",
            }
        )

    cleaned.sort(key=lambda item: (item["learner_id"], item["note_id"]))
    return cleaned


def main() -> None:
    parser = argparse.ArgumentParser(description="Clean the generated Dira demo dataset.")
    parser.add_argument("--input-dir", type=str, default="data/generated_scale_50", help="Directory containing generated CSV files")
    parser.add_argument("--output-dir", type=str, default="data/cleaned/generated_scale_50", help="Directory for cleaned CSV outputs")
    args = parser.parse_args()

    input_dir = resolve_path(args.input_dir)
    output_dir = resolve_path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    required_files = ["learners.csv", "observations.csv", "activity_tests.csv"]
    missing = [name for name in required_files if not (input_dir / name).exists()]
    if missing:
        raise FileNotFoundError(f"Missing required input files: {missing}")

    learners = clean_learners(read_csv_rows(input_dir / "learners.csv"))
    valid_learner_ids = {row["learner_id"] for row in learners}
    observations = clean_observations(read_csv_rows(input_dir / "observations.csv"), valid_learner_ids)
    valid_observation_ids = {row["observation_id"] for row in observations}
    tests = clean_activity_tests(read_csv_rows(input_dir / "activity_tests.csv"), valid_learner_ids, valid_observation_ids)

    write_csv_rows(
        output_dir / "learners.csv",
        ["learner_id", "grade_level", "academic_year", "enrolment_status"],
        learners,
    )
    write_csv_rows(
        output_dir / "observations.csv",
        [
            "observation_id",
            "learner_id",
            "observation_date",
            "term",
            "teacher_id",
            "activity_context",
            "original_observation",
            "source_type",
            "possible_theme",
            "verification_status",
        ],
        observations,
    )
    write_csv_rows(
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

    if (input_dir / "teacher_reviews.csv").exists():
        teacher_reviews = clean_teacher_reviews(read_csv_rows(input_dir / "teacher_reviews.csv"), valid_learner_ids)
        write_csv_rows(
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
            teacher_reviews,
        )

    print(f"Input directory: {input_dir}")
    print(f"Output directory: {output_dir}")
    print(f"learners={len(learners)} observations={len(observations)} tests={len(tests)}")


if __name__ == "__main__":
    main()
