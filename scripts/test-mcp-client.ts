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
    PATH: process.env.PATH ?? "",
    NODE_ENV: "development",
  },
});

async function main() {
  try {
    // Establish the MCP connection and initialize handshake.
    await client.connect(transport);
    console.log("Connected to Dira MCP server.");

    // Discover the server's registered tools.
    const { tools } = await client.listTools();

    console.log(
      "Available tools:",
      tools.map((tool) => tool.name),
    );

    if (!tools.some((tool) => tool.name === "log_observation")) {
      throw new Error("log_observation was not registered");
    }

    // Invoke the tool through the MCP protocol.
    const result = await client.callTool({
      name: "log_observation",
      arguments: {
        learner_id: "learner-demo-001",
        observation_type: "participation",
        content:
          "During group work, the learner explained their solution to two classmates.",
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
  }
}

main().catch((error) => {
  console.error("MCP test failed:", error);
  process.exitCode = 1;
});
