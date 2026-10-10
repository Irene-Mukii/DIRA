"use client";

import React, { useState } from "react";
import ObservationTypeSelector from "./ObservationTypeSelector";

interface ObservationComposerProps {
  onSubmit: (content: string, type: string) => Promise<boolean>;
}

export default function ObservationComposer({ onSubmit }: ObservationComposerProps) {
  const [content, setContent] = useState("");
  const [observationType, setObservationType] = useState("participation");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!content.trim() || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      if (await onSubmit(content, observationType)) {
        setContent("");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 pb-20 md:pb-4">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <label htmlFor="observation-type" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Category:
            </label>
            <ObservationTypeSelector
              id="observation-type"
              value={observationType}
              onChange={setObservationType}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Type your observation here..."
            className="min-w-0 flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-800 border-0 rounded-full text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            data-testid="observation-input"
            disabled={isSubmitting}
          />
          <button
            type="button"
            disabled
            title="Voice transcription is not connected yet"
            aria-label="Voice transcription is not connected yet"
            className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-300 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex items-center justify-center cursor-not-allowed"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="22" />
            </svg>
          </button>
          <button
            type="submit"
            disabled={!content.trim() || isSubmitting}
            className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="send-button"
            aria-label={isSubmitting ? "Saving observation" : "Save observation"}
          >
            {isSubmitting ? (
              <span className="text-xs" aria-hidden="true">…</span>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            )}
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Voice capture will be enabled after transcription is connected.
        </p>
      </form>
    </div>
  );
}
