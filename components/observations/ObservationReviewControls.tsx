"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import ObservationTypeSelector from "@/components/observations/ObservationTypeSelector";

interface ObservationReviewControlsProps {
  observation: {
    observation_id: string;
    original_observation: string;
    reviewed_observation: string | null;
    observation_type: string;
    linked_test_id: string | null;
    teacher_review_status: "not_required" | "recorded" | "confirmed" | "updated";
  };
  tests: Array<{ test_id: string; suggested_activity: string }>;
}

export default function ObservationReviewControls({
  observation,
  tests,
}: ObservationReviewControlsProps) {
  const router = useRouter();
  const submissionId = useRef<string | null>(null);
  const [content, setContent] = useState(
    observation.reviewed_observation ?? observation.original_observation,
  );
  const [type, setType] = useState(observation.observation_type);
  const [testId, setTestId] = useState(observation.linked_test_id ?? "");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submitReview = async (reviewStatus: "confirmed" | "updated") => {
    if (!submissionId.current) submissionId.current = crypto.randomUUID();
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        `/api/mcp/observations/${encodeURIComponent(observation.observation_id)}/review`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            submission_id: submissionId.current,
            review_status: reviewStatus,
            ...(reviewStatus === "updated"
              ? { content, observation_type: type, linked_test_id: testId || null }
              : {}),
          }),
        },
      );
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not save your review.");
      submissionId.current = null;
      setEditing(false);
      router.refresh();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Could not save your review.");
    } finally {
      setSaving(false);
    }
  };

  if (observation.teacher_review_status !== "recorded") {
    return (
      <span className="shrink-0 rounded-full bg-gray-100 px-2 py-1 text-xs capitalize text-gray-600 dark:bg-gray-700 dark:text-gray-200">
        {observation.teacher_review_status === "not_required"
          ? "Saved"
          : observation.teacher_review_status}
      </span>
    );
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
      <p className="text-xs font-medium text-amber-900 dark:text-amber-200">
        Recorded from voice; review before treating this as confirmed.
      </p>
      {editing ? (
        <>
          <label className="block text-xs font-medium" htmlFor={`review-content-${observation.observation_id}`}>
            Observation wording
          </label>
          <textarea
            id={`review-content-${observation.observation_id}`}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={3}
            className="w-full rounded-md border border-gray-300 bg-white p-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium" htmlFor={`review-type-${observation.observation_id}`}>
                Observation type
              </label>
              <ObservationTypeSelector
                id={`review-type-${observation.observation_id}`}
                value={type}
                onChange={setType}
              />
            </div>
            <div className="min-w-48 flex-1">
              <label className="mb-1 block text-xs font-medium" htmlFor={`review-test-${observation.observation_id}`}>
                Suggested test (optional)
              </label>
              <select
                id={`review-test-${observation.observation_id}`}
                value={testId}
                onChange={(event) => setTestId(event.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
              >
                <option value="">No linked test</option>
                {tests.map((test) => (
                  <option key={test.test_id} value={test.test_id}>
                    {test.suggested_activity}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving || !content.trim()}
              onClick={() => void submitReview("updated")}
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                submissionId.current = null;
                setContent(observation.reviewed_observation ?? observation.original_observation);
                setType(observation.observation_type);
                setTestId(observation.linked_test_id ?? "");
                setEditing(false);
                setError("");
              }}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700"
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => void submitReview("confirmed")}
            className="rounded-md bg-green-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Confirm"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => setEditing(true)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700"
          >
            Edit details
          </button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
    </div>
  );
}
