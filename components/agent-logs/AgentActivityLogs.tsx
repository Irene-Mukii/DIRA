"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type LogStatus = "started" | "success" | "error";

interface ActivityLog {
  id: string;
  run_id: string;
  timestamp: string;
  agent_action: string;
  tool_name: string;
  status: LogStatus;
  duration_ms: number | null;
  error: string | null;
}

interface LogsResponse {
  logs: ActivityLog[];
  count: number;
  error?: string;
}

const statusStyles: Record<LogStatus, string> = {
  started: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  error: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
};

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function AgentActivityLogs() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState("");
  const [toolName, setToolName] = useState("");
  const [runId, setRunId] = useState("");
  const [appliedFilters, setAppliedFilters] = useState({
    status: "",
    toolName: "",
    runId: "",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ limit: "100" });
    if (appliedFilters.status) params.set("status", appliedFilters.status);
    if (appliedFilters.toolName) params.set("tool_name", appliedFilters.toolName);
    if (appliedFilters.runId) params.set("run_id", appliedFilters.runId);

    try {
      const response = await fetch(`/api/agent-activity-logs?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      const payload = (await response.json()) as LogsResponse;
      if (!response.ok) {
        throw new Error(payload.error || "Unable to load agent activity logs.");
      }
      setLogs(payload.logs ?? []);
      setCount(payload.count ?? payload.logs?.length ?? 0);
    } catch (loadError) {
      setLogs([]);
      setCount(0);
      setError(loadError instanceof Error ? loadError.message : "Unable to load agent activity logs.");
    } finally {
      setLoading(false);
    }
  }, [appliedFilters]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedFilters({
      status,
      toolName: toolName.trim(),
      runId: runId.trim(),
    });
  }

  function clearFilters() {
    setStatus("");
    setToolName("");
    setRunId("");
    setAppliedFilters({ status: "", toolName: "", runId: "" });
  }

  return (
    <section className="h-full overflow-y-auto bg-gray-50 p-4 dark:bg-gray-900 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-blue-600 dark:text-blue-400">Developer diagnostics</p>
            <h1 className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">Agent activity logs</h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
              Inspect MCP tool calls, outcomes, execution times, and errors.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadLogs()}
            disabled={loading}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            {loading ? "Refreshing…" : "Refresh logs"}
          </button>
        </header>

        <form onSubmit={applyFilters} className="grid grid-cols-1 gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 md:grid-cols-4">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Status
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal dark:border-gray-600 dark:bg-gray-900"
            >
              <option value="">All statuses</option>
              <option value="started">Started</option>
              <option value="success">Success</option>
              <option value="error">Error</option>
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Tool name
            <input
              value={toolName}
              onChange={(event) => setToolName(event.target.value)}
              placeholder="e.g. log_observation"
              maxLength={100}
              className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal dark:border-gray-600 dark:bg-gray-900"
            />
          </label>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Run ID
            <input
              value={runId}
              onChange={(event) => setRunId(event.target.value)}
              placeholder="Filter by UUID"
              className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal dark:border-gray-600 dark:bg-gray-900"
            />
          </label>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Apply filters
            </button>
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Clear
            </button>
          </div>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600 dark:text-gray-400">
          <span>{loading ? "Loading activity…" : `${count} ${count === 1 ? "record" : "records"} returned`}</span>
          <span>Showing up to 100 newest records</span>
        </div>

        {error && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full divide-y divide-gray-200 text-left text-sm dark:divide-gray-700">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-900/60 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Action / tool</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Run ID</th>
                  <th className="px-4 py-3">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {!loading && !error && logs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                      No agent activity matches these filters.
                    </td>
                  </tr>
                )}
                {logs.map((log) => (
                  <tr key={log.id} className="align-top hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-300">{formatTimestamp(log.timestamp)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-gray-100">{log.agent_action}</div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{log.tool_name}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[log.status]}`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-300">
                      {log.duration_ms === null ? "—" : `${log.duration_ms} ms`}
                    </td>
                    <td className="max-w-[220px] break-all px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">{log.run_id}</td>
                    <td className="max-w-sm whitespace-normal px-4 py-3 text-red-700 dark:text-red-300">{log.error || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          This diagnostic screen is intended for development/demo use. Add authenticated administrator authorization before enabling it for production users.
        </p>
      </div>
    </section>
  );
}
