"use client";

import React from "react";

interface RecordingPreviewProps {
  audioUrl: string;
  onConfirm: () => void;
  onDiscard: () => void;
}

export default function RecordingPreview({ audioUrl, onConfirm, onDiscard }: RecordingPreviewProps) {
  return (
    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 mb-4 border border-gray-200 dark:border-gray-700">
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Review your recording</p>
      <audio src={audioUrl} controls className="w-full mb-3" />
      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          Submit
        </button>
        <button
          onClick={onDiscard}
          className="flex-1 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
        >
          Discard
        </button>
      </div>
    </div>
  );
}
