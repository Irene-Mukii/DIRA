import { getWeeklyRotation } from "../lib/rotation";

async function main() {
  const learners = await getWeeklyRotation("SCH001");

  console.table(
    learners.map((learner, index) => ({
      position: index + 1,
      learner_id: learner.learner_id,
      observations: learner.observation_count,
      last_observed_at: learner.last_observed_at,
    })),
  );

  if (learners.length > 10) {
    throw new Error("Rotation returned more than 10 learners");
  }

  if (new Set(learners.map((l) => l.learner_id)).size !== learners.length) {
    throw new Error("Rotation contains duplicate learners");
  }

  for (let i = 1; i < learners.length; i++) {
    const previous = learners[i - 1].last_observed_at?.getTime() ?? -Infinity;
    const current = learners[i].last_observed_at?.getTime() ?? -Infinity;

    if (previous > current) {
      throw new Error("Rotation is not ordered by oldest observation first");
    }
  }

  console.log("Rotation test passed.");
}

main()
  .catch((error) => {
    console.error("Rotation test failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { getPool } = await import("../lib/db/client");
    await getPool().end();
  });
