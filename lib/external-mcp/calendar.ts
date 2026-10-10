import "server-only";

import type { McpSession, McpTool } from "@/lib/agent/mcp-client";

const MAX_CALENDAR_RANGE_MS = 24 * 60 * 60 * 1000;

export interface CalendarEventRange {
  from: string;
  to: string;
  timezone: string;
}

export function getKeeperMcpEndpoint(): string {
  const endpoint = process.env.KEEPER_MCP_URL?.trim();
  return endpoint || "https://www.keeper.sh/mcp";
}

export async function discoverKeeperCalendarTools(
  session: McpSession,
): Promise<McpTool[]> {
  return session.listTools();
}

export async function getKeeperEventCount(
  session: McpSession,
  range: Pick<CalendarEventRange, "from" | "to">,
) {
  const { from, to } = validateRange(range);
  const tool = await requireReadOnlyTool(session, "get_event_count", [
    "from",
    "to",
  ]);

  return session.callTool(tool.name, { from, to });
}

export async function getKeeperEvents(
  session: McpSession,
  range: CalendarEventRange,
) {
  const { from, to } = validateRange(range);
  const { timezone } = range;
  if (typeof timezone !== "string" || timezone.length === 0) {
    throw new Error("Calendar timezone must be a valid IANA timezone");
  }

  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    throw new Error("Calendar timezone must be a valid IANA timezone");
  }

  const tool = await requireReadOnlyTool(session, "get_events", [
    "from",
    "to",
    "timezone",
  ], ["from", "to", "timezone"]);

  return session.callTool(tool.name, { from, to, timezone });
}

async function requireReadOnlyTool(
  session: McpSession,
  toolName: string,
  suppliedProperties: string[],
  requiredProperties: string[] = [],
): Promise<McpTool> {
  const tools = await session.listTools();
  const tool = tools.find(({ name }) => name === toolName);

  if (!tool) {
    throw new Error(`Keeper MCP server does not expose "${toolName}"`);
  }

  if (tool.annotations?.readOnlyHint !== true) {
    throw new Error(`Keeper MCP tool "${toolName}" is not declared read-only`);
  }

  const properties = tool.inputSchema.properties ?? {};
  for (const property of suppliedProperties) {
    if (!(property in properties)) {
      throw new Error(
        `Keeper MCP tool "${toolName}" does not expose input "${property}"`,
      );
    }
  }
  for (const property of requiredProperties) {
    if (!tool.inputSchema.required?.includes(property)) {
      throw new Error(
        `Keeper MCP tool "${toolName}" does not require input "${property}"`,
      );
    }
  }

  return tool;
}

function validateRange(range: Pick<CalendarEventRange, "from" | "to">) {
  if (typeof range.from !== "string" || typeof range.to !== "string") {
    throw new Error("Calendar range must include ISO 8601 start and end values");
  }

  const from = new Date(range.from);
  const to = new Date(range.to);

  if (
    Number.isNaN(from.getTime()) ||
    Number.isNaN(to.getTime()) ||
    !/(?:Z|[+-]\d{2}:\d{2})$/i.test(range.from) ||
    !/(?:Z|[+-]\d{2}:\d{2})$/i.test(range.to)
  ) {
    throw new Error("Calendar range must use ISO 8601 datetimes with a timezone");
  }

  const rangeDuration = to.getTime() - from.getTime();
  if (rangeDuration <= 0 || rangeDuration > MAX_CALENDAR_RANGE_MS) {
    throw new Error("Calendar range must be positive and no longer than 24 hours");
  }

  return { from: range.from, to: range.to };
}
