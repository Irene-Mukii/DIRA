
import { config } from "dotenv";

config({ path: ".env.local" });

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  CAPTURE_METHODS,
  OBSERVATION_TYPES,
} from "../lib/db/schema";

const server = new McpServer({
  name: "dira-mcp-server",
  version: "1.0.0",
});

server.tool(
  "log_observation",
  "Save a teacher's original learner observation to Dira's PostgreSQL database.",
  {
    learner_id: z.string().min(1).max(200),
    observation_type: z.enum(OBSERVATION_TYPES),
    content: z.string().min(1).max(20_000),
    subject: z.string().max(200).optional(),
    term: z.string().max(100).optional(),
    observed_at: z.string().datetime({ offset: true }).optional(),
    linked_test_id: z.string().max(200).optional(),
    capture_method: z.enum(CAPTURE_METHODS).default("text"),
    submission_id: z.string().min(1).max(200),
  },
  async (input) => {
    // Load the logger after dotenv has loaded .env.local.
    const { createRunId, logToolEvent } = await import(
      "../lib/agent/logger"
    );

    const runId = createRunId();
    const startedAt = Date.now();

    try {
      await logToolEvent({
        run_id: runId,
        agent_action: "tool_call",
        tool_name: "log_observation",
        status: "started",
        tool_input: {
          learner_id: input.learner_id,
          observation_type: input.observation_type,
          submission_id: input.submission_id,
        },
      });

      const { logObservation } = await import(
        "../lib/mcp-tools/logObservation"
      );

      const result = await logObservation(input);

      await logToolEvent({
        run_id: runId,
        agent_action: "tool_result",
        tool_name: "log_observation",
        status: "success",
        duration_ms: Date.now() - startedAt,
        tool_output: {
          success: true,
          duplicate: result.duplicate,
          observation_id: result.observation.observation_id,
        },
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              duplicate: result.duplicate,
              observation: result.observation,
            }),
          },
        ],
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";

      try {
        // Import the logger here too, in case its initial import failed.
        const { logToolEvent } = await import("../lib/agent/logger");

        await logToolEvent({
          run_id: runId,
          agent_action: "tool_result",
          tool_name: "log_observation",
          status: "error",
          duration_ms: Date.now() - startedAt,
          error: message,
        });
      } catch (loggingError) {
        console.error("Failed to persist tool error log:", loggingError);
      }

      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: message,
            }),
          },
        ],
      };
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Failed to start Dira MCP server:", error);
  process.exitCode = 1;
});