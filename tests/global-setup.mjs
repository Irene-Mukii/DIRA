import { loadEnvConfig } from "@next/env";

function validateDevelopmentDatabaseUrl(databaseUrl) {
  if (!databaseUrl) {
    throw new Error(
      "Follow-up integration tests require DIRA_TEST_DATABASE_URL in .env.local or the process environment.",
    );
  }

  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error(
      "Follow-up integration tests require a valid PostgreSQL DIRA_TEST_DATABASE_URL.",
    );
  }

  const hostname = parsed.hostname.toLowerCase();
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  const username = decodeURIComponent(parsed.username);
  const isLoopback = ["localhost", "127.0.0.1", "::1"].includes(hostname);

  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !isLoopback ||
    databaseName !== "dira_dev" ||
    username !== "dira_dev" ||
    parsed.port !== "5433"
  ) {
    throw new Error(
      "Refusing follow-up integration tests: DIRA_TEST_DATABASE_URL must target the local Docker development database dira_dev as user dira_dev on port 5433.",
    );
  }
}

export default async function globalSetup() {
  loadEnvConfig(process.cwd(), true);
  const testDatabaseUrl = process.env.DIRA_TEST_DATABASE_URL;
  validateDevelopmentDatabaseUrl(testDatabaseUrl);
  process.env.DATABASE_URL = testDatabaseUrl;
}
