"use client";

import React, { useState } from "react";
import ObservationTypeSelector from "./ObservationTypeSelector";
import VoiceNoteRecorder from "./VoiceNoteRecorder";
import RecordingPreview from "./RecordingPreview";

interface ObservationComposerProps {
  onSubmit: (content: string, type: string) => void;
  onSubmitRecording: (audioBlob: Blob, audioUrl: string, type: string, transcription: string) => void;
}

const MicIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="22" />
  </svg>
);

const SendIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const MicFillIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
  </svg>
);

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

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Type your observation here..."
                className="w-full px-4 py-3 pr-14 bg-gray-100 dark:bg-gray-800 border-0 rounded-full text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-800 disabled:opacity-50"
                data-testid="observation-input"
                disabled={isSubmitting}
              />
            </div>
            <button
              type="button"
              onClick={startRecording}
              disabled={isSubmitting}
              className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-800"
              title="Record voice note"
              aria-label="Record voice note"
              data-testid="mic-button"
            >
              <MicIcon />
            </button>
            <button
              type="submit"
              disabled={!content.trim() || isSubmitting}
              className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-800"
              data-testid="send-button"
              aria-label="Send observation"
            >
              <SendIcon />
            </button>
          </div>
        </form>
      )}
    </div>
  );
}