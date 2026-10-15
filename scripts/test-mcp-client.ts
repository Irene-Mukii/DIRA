import { config } from "dotenv";

config({ path: ".env.local" });

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({
  name: "dira-mcp-test-client",
  version: "1.0.0",
});

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["--import", "tsx", "scripts/mcp-server.ts"],
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: "development",
  },
});

async function main() {
  // Import after dotenv configuration so DATABASE_URL is available.
  const { getPool } = await import("../lib/db/client");

  try {
    // Match the trusted teacher context selected by the MCP server.
    const contextResult = await getPool().query<{
      teacher_id: string;
      school_id: string;
    }>(
      `SELECT teacher_id, school_id
       FROM teachers
       ORDER BY created_at ASC, teacher_id ASC, school_id ASC
       LIMIT 1`,
    );
    const context = contextResult.rows[0];
    if (!context) {
      throw new Error("No trusted teacher context is available for the MCP test");
    }

    // Pick a currently accepted linked test that this teacher can validly observe.
    // The observation consumes the test by changing its status to COMPLETED.
    const candidateResult = await getPool().query<{
      test_id: string;
      learner_id: string;
    }>(
      `SELECT DISTINCT t.test_id, t.learner_id
       FROM activity_tests t
       JOIN learner_enrollments e
         ON e.learner_id = t.learner_id
        AND e.school_id = $2
       JOIN classes c
         ON c.class_id = e.class_id
        AND c.school_id = e.school_id
        AND c.academic_year = e.academic_year
       JOIN timetable_assignments ta
         ON ta.class_id = e.class_id
        AND ta.school_id = e.school_id
        AND ta.academic_year = e.academic_year
       WHERE t.status = 'ACCEPTED'
         AND ta.teacher_id = $1
         AND ta.valid_from <= CURRENT_DATE
         AND (ta.valid_to IS NULL OR ta.valid_to >= CURRENT_DATE)
         AND e.enrolment_status <> 'Withdrawn'
         AND e.enrolled_from <= CURRENT_DATE
         AND (e.enrolled_to IS NULL OR e.enrolled_to >= CURRENT_DATE)
       ORDER BY t.test_id
       LIMIT 1`,
      [context.teacher_id, context.school_id],
    );
    const candidate = candidateResult.rows[0];
    if (!candidate) {
      throw new Error(
        `No currently accepted linked test is available for teacher ${context.teacher_id}. ` +
          "Seed or select a fresh accepted test before running the MCP end-to-end test.",
      );
    }

    console.log(
      `Using eligible test ${candidate.test_id} for learner ${candidate.learner_id}.`,
    );

    await client.connect(transport);
    console.log("Connected to Dira MCP server.");

    const { tools } = await client.listTools();
    console.log("Available tools:", tools.map((tool) => tool.name));

    if (!tools.some((tool) => tool.name === "log_observation")) {
      throw new Error("log_observation was not registered");
    }

    const result = await client.callTool({
      name: "log_observation",
      arguments: {
        learner_id: candidate.learner_id,
        linked_test_id: candidate.test_id,
        observation_type: "participation",
        observed_at: new Date().toISOString(),
        content:
          "MCP end-to-end test: learner explained their solution during group work.",
        subject: "Mathematics",
        term: "Term 3",
        capture_method: "text",
        submission_id: `mcp-e2e-${Date.now()}`,
      },
    });

    console.log("Tool result:");
    console.log(JSON.stringify(result, null, 2));

    if (result.isError) {
      throw new Error("MCP tool returned an error");
    }

    console.log("MCP end-to-end test passed.");
  } finally {
    await client.close();
    await getPool().end();
  }
}

main().catch((error) => {
  console.error("MCP test failed:", error);
  process.exitCode = 1;
});
