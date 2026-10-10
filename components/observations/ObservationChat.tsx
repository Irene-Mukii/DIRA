"use client";

import React, { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import ObservationComposer from "./ObservationComposer";
import ObservationMessage from "./ObservationMessage";

interface ObservationMessageData {
  id: string;
  type: "teacher" | "system" | "saved";
  content: string;
  timestamp: string;
  status?: "error";
  reviewStatus?: "recorded" | "confirmed" | "updated" | "not_required";
}

interface LogObservationResponse {
  error?: string;
  observation?: {
    observation_id: string;
  };
  observations?: Array<{
    observation_id: string;
    original_observation: string;
    reviewed_observation: string | null;
    teacher_review_status: ObservationMessageData["reviewStatus"];
    created_at: string;
  }>;
}

interface ObservationChatProps {
  learnerId?: string;
  className?: string;
}

export default function ObservationChat({
  learnerId: suppliedLearnerId,
  className = "",
}: ObservationChatProps) {
  const [messages, setMessages] = useState<ObservationMessageData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pendingSubmission = useRef<{
    content: string;
    type: string;
    submissionId: string;
    timestamp: string;
  } | null>(null);
  const reviewSubmissions = useRef(new Map<string, string>());
  const params = useParams<{ learnerId?: string }>();
  const learnerId = suppliedLearnerId ?? params.learnerId;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    const loadObservations = async () => {
      if (!learnerId) {
        setMessages([{
          id: crypto.randomUUID(),
          type: "system",
          content: "Select a learner before loading or saving observations.",
          timestamp: new Date().toISOString(),
          status: "error",
        }]);
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch(
          `/api/mcp/log-observation?learner_id=${encodeURIComponent(learnerId)}`,
          { cache: "no-store" },
        );
        const payload = await response.json() as LogObservationResponse;
        if (!response.ok) {
          throw new Error(payload.error || "Could not load observations.");
        }

        const loadedMessages = payload.observations ?? [];
        setMessages(loadedMessages.map((observation) => ({
          id: observation.observation_id,
          type: "teacher",
          content: observation.reviewed_observation ?? observation.original_observation,
          timestamp: observation.created_at,
          reviewStatus: observation.teacher_review_status,
        })));
      } catch (error) {
        setMessages([{
          id: crypto.randomUUID(),
          type: "system",
          content: error instanceof Error ? error.message : "Could not load observations.",
          timestamp: new Date().toISOString(),
          status: "error",
        }]);
      } finally {
        setIsLoading(false);
      }
    };

    void loadObservations();
  }, [learnerId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (content: string, type: string): Promise<boolean> => {
    if (!learnerId) {
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        type: "system",
        content: "Select a learner before saving an observation.",
        timestamp: new Date().toISOString(),
        status: "error",
      }]);
      return false;
    }

    if (
      !pendingSubmission.current ||
      pendingSubmission.current.content !== content ||
      pendingSubmission.current.type !== type
    ) {
      pendingSubmission.current = {
        content,
        type,
        submissionId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      };
    }
    const { submissionId, timestamp } = pendingSubmission.current;

    setMessages((current) => (
      current.some((message) => message.id === submissionId)
        ? current
        : [...current, {
            id: submissionId,
            type: "teacher",
            content,
            timestamp,
          }]
    ));

    try {
      const response = await fetch("/api/mcp/log-observation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          learner_id: learnerId,
          content,
          observation_type: type,
          observed_at: timestamp,
          capture_method: "text",
          submission_id: submissionId,
        }),
      });
      const payload = await response.json() as LogObservationResponse;
      if (!response.ok) {
        throw new Error(payload.error || "Could not save observation.");
      }
      const savedObservationId = payload.observation?.observation_id;
      if (!savedObservationId) {
        throw new Error("The server did not confirm the saved observation.");
      }

      setMessages((current) => current.map((message) => (
        message.id === submissionId
          ? { ...message, id: savedObservationId }
          : message
      )).filter((message) => message.id !== `error-${submissionId}`));
      pendingSubmission.current = null;
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        type: "saved",
        content: "Observation saved.",
        timestamp: new Date().toISOString(),
      }]);
      return true;
    } catch (error) {
      setMessages((current) => {
        const errorMessage = {
          id: `error-${submissionId}`,
          type: "system" as const,
          content: error instanceof Error
            ? `Not saved: ${error.message}`
            : "Not saved: please try again.",
          timestamp: new Date().toISOString(),
          status: "error" as const,
        };
        return current.some((message) => message.id === errorMessage.id)
          ? current.map((message) => (
              message.id === errorMessage.id ? errorMessage : message
            ))
          : [...current, errorMessage];
      });
      return false;
    }
  };

  const handleReview = async (
    observationId: string,
    review: { review_status: "confirmed" | "updated"; content?: string },
  ): Promise<boolean> => {
    const requestKey = `${observationId}:${JSON.stringify(review)}`;
    let submissionId = reviewSubmissions.current.get(requestKey);
    if (!submissionId) {
      submissionId = crypto.randomUUID();
      reviewSubmissions.current.set(requestKey, submissionId);
    }

    try {
      const response = await fetch(
        `/api/mcp/observations/${encodeURIComponent(observationId)}/review`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...review, submission_id: submissionId }),
        },
      );
      const payload = await response.json() as {
        error?: string;
        observation?: { teacher_review_status: ObservationMessageData["reviewStatus"] };
      };
      if (!response.ok || !payload.observation) {
        throw new Error(payload.error || "Could not review observation.");
      }
      reviewSubmissions.current.delete(requestKey);
      setMessages((current) => current.map((message) => (
        message.id === observationId
          ? {
              ...message,
              content: review.content ?? message.content,
              reviewStatus: payload.observation!.teacher_review_status,
            }
          : message
      )));
      return true;
    } catch (error) {
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        type: "system",
        content: error instanceof Error ? error.message : "Could not review observation.",
        timestamp: new Date().toISOString(),
        status: "error",
      }]);
      return false;
    }
  };

  return (
    <div className={`flex flex-col h-full bg-white dark:bg-gray-900 ${className}`}>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoading ? (
          <p className="py-8 text-center text-sm text-gray-500">Loading observations…</p>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">
            No observations yet. Add the first observation below.
          </p>
        ) : (
          messages.map((message) => (
            <ObservationMessage
              key={message.id}
              message={message}
              onReview={(review) => handleReview(message.id, review)}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
      <ObservationComposer onSubmit={handleSubmit} />
    </div>
  );
}
