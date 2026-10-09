// Main chat interface for capturing a teacher's observation for a selected learner.
"use client";

import React, { useState, useRef, useEffect } from "react";
import ObservationMessage, { Message } from "./ObservationMessage";
import ObservationComposer from "./ObservationComposer";
import { TranscriptionHandler } from "@/lib/agent/transcription-handler";

interface ObservationChatProps {
  learnerId: string;
  learnerName?: string;
}

export default function ObservationChat({ learnerId, learnerName = "Learner" }: ObservationChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      type: "system",
      content: `You're logging an observation for ${learnerName}.\n\nYou can type a note or record a short voice note (up to 1 minute). I'll save it as an observation for ${learnerName}.\n\nWhat did you notice today?`,
    },
  ]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmitText = (content: string, type: string) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      type: "teacher",
      content,
      timestamp: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages((prev) => [...prev, newMessage]);

    TranscriptionHandler.store({
      id: newMessage.id,
      learnerId,
      text: content,
      timestamp: new Date(),
      source: "text",
    });

    setTimeout(() => {
      const savedMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: "saved",
        content: `Observation saved\n\nI've recorded your observation for ${learnerName}.\n\nSubject: Mathematics | Type: ${type || "Classroom participation"}`,
      };
      setMessages((prev) => [...prev, savedMessage]);
    }, 500);
  };

  const handleSubmitRecording = (audioBlob: Blob, audioUrl: string, type: string, transcription: string) => {
    const recordingMessage: Message = {
      id: Date.now().toString(),
      type: "recording",
      content: "",
      audioUrl,
      duration: 5,
    };
    setMessages((prev) => [...prev, recordingMessage]);

    TranscriptionHandler.store({
      id: recordingMessage.id,
      learnerId,
      text: transcription,
      timestamp: new Date(),
      source: "voice",
    });

    setTimeout(() => {
      const transcriptionMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: "transcription",
        content: transcription,
      };
      setMessages((prev) => [...prev, transcriptionMessage]);

      setTimeout(() => {
        const savedMessage: Message = {
          id: (Date.now() + 2).toString(),
          type: "saved",
          content: `Observation saved\n\nI've recorded your observation for ${learnerName}.\n\nSubject: Mathematics | Type: ${type || "Classroom participation"}`,
        };
        setMessages((prev) => [...prev, savedMessage]);
      }, 300);
    }, 500);
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800 overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {messages.map((message) => (
          <ObservationMessage key={message.id} message={message} />
        ))}
        <div ref={messagesEndRef} />
      </div>
      <ObservationComposer onSubmit={handleSubmitText} onSubmitRecording={handleSubmitRecording} />
    </div>
  );
}
