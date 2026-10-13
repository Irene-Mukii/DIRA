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
            set(row["observation_id"] for row in demo_rows).isdisjoint(
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
