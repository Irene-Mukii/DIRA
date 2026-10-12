// Trigger one of the internal follow-up jobs over HTTP with the scheduler secret.
// Usage: node --env-file=.env.local scripts/trigger-follow-up.cjs <queue|dispatch|recordings>
//   queue       prepare/refresh today's queue (schedule this daily at 07:00 school time;
//               it only creates queue rows and never places calls)
//   dispatch    manual/test dispatch of one currently due call (the normal trigger is
//               the post-class scheduler; this is the manual override for testing)
//   recordings  retry pending recording transcription/draft processing
const routes = {
  queue: "/api/internal/follow-up-queue",
  dispatch: "/api/internal/follow-up-dispatch",
  recordings: "/api/internal/call-recordings",
};

async function main() {
  const route = routes[process.argv[2]];
  const secret = process.env.FOLLOW_UP_SCHEDULER_SECRET;
  if (!route || !secret) {
    console.error("Usage: trigger-follow-up.cjs <queue|dispatch|recordings> (FOLLOW_UP_SCHEDULER_SECRET required)");
    process.exit(1);
  }
  const base = (process.env.DIRA_TRIGGER_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
  const response = await fetch(base + route, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  });
  console.log(response.status, await response.text());
  process.exit(response.ok ? 0 : 1);
}

main().catch((error) => {
  console.error("Trigger failed:", error.message);
  process.exit(1);
});
