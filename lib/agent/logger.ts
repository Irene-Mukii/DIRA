import { randomUUID } from "node:crypto";
import { calculateModelCost } from "@/lib/agent/model-cost";
import type { ModelUsage } from "@/lib/models";

type ToolStatus = "started" | "success" | "error";
export type AgentActivityStatus = ToolStatus;

export type AgentActivityEventType =
  | "tool_event"
  | "run_started"
  | "run_finished"
  | "model_call"
  | "tool_proposed"
  | "tool_executed"
  | "tool_blocked"
  | "cache_hit"
  | "cache_miss"
  | "cache_refresh"
  | "cache_refresh_failed"
  | "cache_body_expired"
  | "fetch_connection"
  | "fetch_tool_discovery"
  | "fetch_request";

export interface AgentActivityEvent {
  run_id: string;
  agent_action: string;
  tool_name: string;
  status: AgentActivityStatus;
  event_type?: AgentActivityEventType;
  workflow?: string;
  attempt?: number;
  provider?: string;
  model?: string;
  usage?: ModelUsage | null;
  cost_status?: "calculated" | "unknown" | "not_applicable";
  metadata?: Record<string, unknown>;
  duration_ms?: number;
  error?: string;
  tool_input?: Record<string, unknown>;
  tool_output?: Record<string, unknown>;
}

export function createRunId(): string {
  return randomUUID();
}

export async function logAgentEvent(
  event: AgentActivityEvent,
): Promise<boolean> {
  const timestamp = new Date().toISOString();
  const eventType = event.event_type ?? "tool_event";
  const cost =
    event.model && event.usage !== undefined
      ? calculateModelCost(event.model, event.usage)
      : null;
  const metadata: Record<string, unknown> = {
    ...event.metadata,
    ...(cost
      ? {
          pricing_source: cost.pricingSource,
          pricing_observed_on: cost.pricingObservedOn,
          pricing_version: cost.pricingVersion,
        }
      : {}),
  };
  const correlationId =
    typeof metadata.correlation_id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      metadata.correlation_id,
    )
      ? metadata.correlation_id
      : undefined;
  const transport =
    metadata.transport === "stdio" || metadata.transport === "http"
      ? metadata.transport
      : undefined;

  console.info(
    JSON.stringify({
      timestamp,
      run_id: event.run_id,
      workflow: event.workflow,
      event_type: eventType,
      agent_action: event.agent_action,
      tool_name: event.tool_name,
      status: event.status,
      ...(correlationId ? { correlation_id: correlationId } : {}),
      ...(transport ? { transport } : {}),
      ...(event.duration_ms !== undefined
        ? { duration_ms: event.duration_ms }
        : {}),
      ...(event.error ? { error: event.error } : {}),
    }),
  );

  try {
    const { getPool } = await import("../db/client");

    await getPool().query(
      `INSERT INTO agent_activity_logs (
        run_id,
        timestamp,
        event_type,
        workflow,
        attempt,
        provider,
        model,
        input_tokens,
        output_tokens,
        cached_tokens,
        cost_usd,
        cost_status,
        metadata,
        agent_action,
        tool_name,
        tool_input,
        tool_output,
        status,
        duration_ms,
        error
      ) VALUES (
        $1, $2::timestamptz, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13::jsonb, $14, $15, $16::jsonb, $17::jsonb,
        $18, $19, $20
      )`,
      [
        event.run_id,
        timestamp,
        eventType,
        event.workflow ?? null,
        event.attempt ?? null,
        event.provider ?? null,
        event.model ?? null,
        event.usage?.inputTokens ?? null,
        event.usage?.outputTokens ?? null,
        event.usage?.cachedInputTokens ?? null,
        cost?.costUsd ?? null,
        event.cost_status ?? cost?.costStatus ?? null,
        JSON.stringify(metadata),
        event.agent_action,
        event.tool_name,
        event.tool_input ? JSON.stringify(event.tool_input) : null,
        event.tool_output ? JSON.stringify(event.tool_output) : null,
        event.status,
        event.duration_ms ?? null,
        event.error ?? null,
      ],
    );
    return true;
  } catch (loggingError) {
    console.error(
      "Failed to persist agent activity log:",
      loggingError instanceof Error ? loggingError.name : "UnknownError",
    );
    return false;
  }
}

export async function logToolEvent(
  event: Omit<AgentActivityEvent, "event_type">,
): Promise<boolean> {
  return logAgentEvent({ ...event, event_type: "tool_event" });
}

// Compatibility logger used by the transcription handler.
// Do not log transcription text or other sensitive content.
export const logger = {
  log(eventName: string, metadata: Record<string, unknown> = {}): void {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        agent_action: eventName,
        ...metadata,
      }),
    );
  },
};
