"use client";

import React, { useState } from "react";
import ObservationTypeSelector from "./ObservationTypeSelector";
import VoiceNoteRecorder from "./VoiceNoteRecorder";
import RecordingPreview from "./RecordingPreview";

interface ObservationComposerProps {
  onSubmit: (content: string, type: string) => void;
  onSubmitRecording: (audioBlob: Blob, audioUrl: string, type: string, transcription: string) => void;
}

export default function ObservationComposer({ onSubmit, onSubmitRecording }: ObservationComposerProps) {
  const [content, setContent] = useState("");
  const [observationType, setObservationType] = useState("participation");
  const [recordingState, setRecordingState] = useState<"idle" | "recording" | "preview">("idle");
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string | null>(null);
  const [currentAudioBlob, setCurrentAudioBlob] = useState<Blob | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (content.trim() && !isSubmitting) {
      setIsSubmitting(true);
      try {
        await onSubmit(content, observationType);
        setContent("");
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleRecordingComplete = (audioBlob: Blob, audioUrl: string) => {
    setCurrentAudioBlob(audioBlob);
    setCurrentAudioUrl(audioUrl);
    setRecordingState("preview");
  };

  const handleRecordingCancel = () => {
    setRecordingState("idle");
  };

  const handleConfirmRecording = async () => {
    if (currentAudioBlob && currentAudioUrl && !isSubmitting) {
      setIsSubmitting(true);
      try {
        const transcription = content.trim() || "Voice note transcribed";
        await onSubmitRecording(currentAudioBlob, currentAudioUrl, observationType, transcription);
        setRecordingState("idle");
        setContent("");
        setCurrentAudioBlob(null);
        setCurrentAudioUrl(null);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleDiscardRecording = () => {
    setRecordingState("idle");
    setContent("");
    setCurrentAudioBlob(null);
    if (currentAudioUrl) {
      URL.revokeObjectURL(currentAudioUrl);
      setCurrentAudioUrl(null);
    }
  };

  const startRecording = (e: React.MouseEvent) => {
    e.preventDefault();
    setRecordingState("recording");
  };

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 pb-20 md:pb-4">
      {recordingState === "preview" && currentAudioUrl && (
        <RecordingPreview
          audioUrl={currentAudioUrl}
          onConfirm={handleConfirmRecording}
          onDiscard={handleDiscardRecording}
        />
      )}

      {recordingState === "recording" && (
        <VoiceNoteRecorder
          onRecordingComplete={handleRecordingComplete}
          onRecordingCancel={handleRecordingCancel}
        />
      )}

      {recordingState === "idle" && (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Category:</span>
              <ObservationTypeSelector value={observationType} onChange={setObservationType} />
            </div>
          </div>

          <div className="flex space-x-2 items-center">
            <input
              type="text"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Type your observation here..."
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              data-testid="observation-input"
            />
            <button
              type="button"
              onClick={startRecording}
              className="p-2 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              title="Record voice note"
              aria-label="Record voice note"
              data-testid="mic-button"
            >
              🎤
            </button>
            <button
              type="submit"
              disabled={!content.trim() || isSubmitting}
              className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="send-button"
            >
              Send
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
