// Displays observation conversation messages, recording states, and confirmed save results.
import React, { useState } from "react";

export interface Message {
  id: string;
  type: "teacher" | "system" | "saved" | "transcription" | "recording";
  content: string;
  timestamp?: string;
  audioUrl?: string;
  duration?: number;
  status?: "processing" | "done" | "error";
  reviewStatus?: "recorded" | "confirmed" | "updated" | "not_required";
}

interface ObservationMessageProps {
  message: Message;
  onReview?: (input: {
    review_status: "confirmed" | "updated";
    content?: string;
  }) => Promise<boolean>;
}

export default function ObservationMessage({ message, onReview }: ObservationMessageProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [isSaving, setIsSaving] = useState(false);

  if (message.type === "teacher") {
    return (
      <div className="flex justify-end">
        <div className="max-w-xs rounded-2xl rounded-tr-sm bg-blue-600 px-4 py-2 text-white lg:max-w-md">
          {isEditing ? (
            <textarea
              aria-label="Edit observation"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="w-full rounded bg-white p-2 text-sm text-gray-900"
              rows={3}
            />
          ) : (
            <p className="whitespace-pre-wrap text-sm">{message.content}</p>
          )}
          {message.timestamp && (
            <p className="text-xs text-blue-100 mt-1">{message.timestamp}</p>
          )}
          {message.reviewStatus && message.reviewStatus !== "not_required" && (
            <div className="mt-2 flex items-center justify-between gap-3 border-t border-blue-400/50 pt-2">
              <span className="text-xs capitalize text-blue-100">
                {message.reviewStatus === "recorded"
                  ? "Awaiting your review"
                  : message.reviewStatus}
              </span>
              {message.reviewStatus === "recorded" && onReview && (
                <div className="flex items-center gap-1">
                  {isEditing ? (
                    <>
                      <button
                        type="button"
                        aria-label="Save observation edit"
                        title="Save edit"
                        disabled={isSaving || !draft.trim()}
                        onClick={async () => {
                          setIsSaving(true);
                          if (await onReview({ review_status: "updated", content: draft })) {
                            setIsEditing(false);
                          }
                          setIsSaving(false);
                        }}
                        className="rounded p-1 text-xs hover:bg-blue-500 disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        aria-label="Cancel observation edit"
                        title="Cancel edit"
                        onClick={() => {
                          setDraft(message.content);
                          setIsEditing(false);
                        }}
                        className="rounded p-1 text-xs hover:bg-blue-500"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        aria-label="Confirm observation"
                        title="Confirm"
                        disabled={isSaving}
                        onClick={async () => {
                          setIsSaving(true);
                          await onReview({ review_status: "confirmed" });
                          setIsSaving(false);
                        }}
                        className="rounded p-1 hover:bg-blue-500 disabled:opacity-50"
                      >
                        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4">
                          <path d="m4 10 4 4 8-8" fill="none" stroke="currentColor" strokeWidth="2" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        aria-label="Edit observation"
                        title="Edit"
                        disabled={isSaving}
                        onClick={() => setIsEditing(true)}
                        className="rounded p-1 hover:bg-blue-500 disabled:opacity-50"
                      >
                        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4">
                          <path d="m13 4 3 3M4 16l3-.5L16 6.5 13.5 4 4.5 13z" fill="none" stroke="currentColor" strokeWidth="1.5" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (message.type === "system") {
    return (
      <div className="flex justify-start">
        <div className="max-w-xs lg:max-w-md bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-2xl px-4 py-2 rounded-tl-sm">
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }

  if (message.type === "saved") {
    return (
      <div className="flex justify-start">
        <div className="max-w-xs lg:max-w-md bg-green-50 dark:bg-green-900/30 text-gray-800 dark:text-gray-200 rounded-2xl px-4 py-2 rounded-tl-sm border border-green-200 dark:border-green-800">
          <div className="flex items-start space-x-2">
            <span className="text-green-600 dark:text-green-400">✓</span>
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          </div>
        </div>
      </div>
    );
  }

  if (message.type === "transcription") {
    return (
      <div className="flex justify-start">
        <div className="max-w-xs lg:max-w-md bg-gray-100 dark:bg-gray-700 rounded-2xl px-4 py-2 rounded-tl-sm">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Transcription</p>
          <p className="text-sm text-gray-800 dark:text-gray-200">{message.content}</p>
        </div>
      </div>
    );
  }

  if (message.type === "recording") {
    return (
      <div className="flex justify-start">
        <div className="max-w-xs lg:max-w-md bg-gray-100 dark:bg-gray-700 rounded-2xl px-4 py-2 rounded-tl-sm">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v9.114A4.369 4.369 0 005 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.369 4.369 0 0015 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="bg-gray-300 dark:bg-gray-600 h-2 rounded-full w-32 animate-pulse"></div>
              {message.duration && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{message.duration}s</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
