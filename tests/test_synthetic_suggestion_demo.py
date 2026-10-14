import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import generate_synthetic_data as synthetic  # noqa: E402


class SuggestionDemoDataTests(unittest.TestCase):
    def test_l003_gets_two_review_eligible_synthetic_participation_observations(self):
        enrollment = {
                "learner_id": "L003",
                "class_id": "C2026-Grade5-A",
                "school_id": "SCH001",
                "academic_year": 2026,
        }
        calendar = [
                {
                    "class_id": enrollment["class_id"],
                    "teacher_id": "T001",
                    "academic_year": 2026,
                    "calendar_date": f"2026-05-{day:02d}",
                    "period_number": 1,
                    "school_id": "SCH001",
                    "start_time": "08:45",
                    "term": "Term 2",
                    "calendar_entry_id": f"CAL{day}",
                    "subject": "Mathematics",
                }
                for day in (4, 12)
        ]

        rows, learner_observation_ids = synthetic.make_observations(
                [enrollment], calendar, seed=42
        )
        demo_rows = [
            row for row in rows if row["observation_id"].startswith("OBS_DEMO_L003_SUGGEST_")
        ]

        self.assertEqual(len(demo_rows), 2)
        self.assertEqual({row["learner_id"] for row in demo_rows}, {"L003"})
        self.assertEqual({row["teacher_id"] for row in demo_rows}, {"T001"})
        self.assertEqual({row["observation_type"] for row in demo_rows}, {"participation"})
        self.assertEqual({row["capture_method"] for row in demo_rows}, {"text"})
        self.assertEqual(len({row["observation_date"] for row in demo_rows}), 2)
        self.assertEqual(len({row["activity_context"] for row in demo_rows}), 2)
        self.assertTrue(all("Synthetic demo:" in row["original_observation"] for row in demo_rows))
        self.assertTrue(
            set(row["observation_id"] for row in demo_rows).issubset(
                learner_observation_ids[(enrollment["learner_id"], enrollment["class_id"])]
            )
        )
        self.assertTrue(
            all(
                row["observation_type"] == "other"
                for row in rows
                if row["observation_id"] not in {demo["observation_id"] for demo in demo_rows}
            )
        )

    def test_l003_has_deterministic_conflicting_evidence_and_test_lifecycle_rows(self):
        enrollment = {
                "learner_id": "L003",
                "class_id": "C2026-Grade5-A",
                "school_id": "SCH001",
                "academic_year": 2026,
        }
        calendar = [
                {
                    "class_id": enrollment["class_id"],
                    "teacher_id": "T001",
                    "academic_year": 2026,
                    "calendar_date": f"2026-05-{day:02d}",
                    "period_number": 1,
                    "school_id": "SCH001",
                    "start_time": "08:45",
                    "term": "Term 2",
                    "calendar_entry_id": f"CAL{day}",
                    "subject": "Mathematics",
                }
                for day in (4, 12)
        ]
        observations, learner_observation_ids = synthetic.make_observations(
                [enrollment], calendar, seed=42
        )
        tests, outcome_observations = synthetic.make_tests(
                [enrollment],
                calendar,
                observations,
                learner_observation_ids,
                seed=42,
        )

        suggested = next(row for row in tests if row["test_id"] == "TEST_DEMO_L003_SUGGESTED")
        completed = next(row for row in tests if row["test_id"] == "TEST_DEMO_L003_COMPLETED")
        l003_observations = {
                row["observation_id"]: row
                for row in observations
                if row["observation_id"].startswith("OBS_DEMO_L003_SUGGEST_")
        }
        outcome = next(
                row
                for row in outcome_observations
                if row["observation_id"] == "OBS_DEMO_L003_OUTCOME_01"
        )

        self.assertIn(
            "offered an idea",
            l003_observations["OBS_DEMO_L003_SUGGEST_01"]["original_observation"],
        )
        self.assertIn(
            "did not offer an idea",
            l003_observations["OBS_DEMO_L003_SUGGEST_02"]["original_observation"],
        )
        self.assertEqual(suggested["status"], "SUGGESTED")
        self.assertEqual(completed["status"], "COMPLETED")
        self.assertEqual(completed["outcome_observation_id"], outcome["observation_id"])
        self.assertEqual(outcome["linked_test_id"], completed["test_id"])
        self.assertEqual(
            suggested["trigger_observation_roles"].split(", "),
            ["supporting", "contradicting"],
        )
        self.assertEqual(
            completed["trigger_observation_roles"].split(", "),
            ["supporting", "contradicting"],
        )

    def test_ordinary_and_exact_match_name_lists_include_amani(self):
        self.assertIn("Amani", synthetic.KENYAN_FIRST_NAMES)
        self.assertIn("Amani", synthetic.EXACT_MATCH_FIRST_NAMES)
        learners, _ = synthetic.make_learners(50, 2)
        amani_ids = {
            row["learner_id"]
            for row in learners
            if row["display_name"].split()[0] == "Amani"
        }
        self.assertIn("L031", amani_ids)
        self.assertIn("L029", amani_ids)
        self.assertIn("L030", amani_ids)

    def test_generator_still_works_when_t001_has_no_l003_schedule(self):
        enrollment = {
            "learner_id": "L003",
            "class_id": "C2026-Grade5-A",
            "school_id": "SCH001",
            "academic_year": 2026,
        }
        calendar = [
            {
                "class_id": enrollment["class_id"],
                "teacher_id": "T005",
                "academic_year": 2026,
                "calendar_date": "2026-05-04",
                "period_number": 1,
                "school_id": "SCH001",
                "start_time": "08:45",
                "term": "Term 2",
                "calendar_entry_id": "CAL4",
                "subject": "Mathematics",
            }
        ]

        rows, _ = synthetic.make_observations([enrollment], calendar, seed=42)

        self.assertFalse(
            any(row["observation_id"].startswith("OBS_DEMO_L003_SUGGEST_") for row in rows)
        )


if __name__ == "__main__":
    unittest.main()
