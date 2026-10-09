// Agent handler for transcribed observation text
// This module enables AI agent to access and process transcribed entries

import { logger } from "./logger";

export interface TranscribedObservation {
  id: string;
  learnerId: string;
  text: string;
  timestamp: Date;
  confidence?: number;
  source: "voice" | "text";
}

export class TranscriptionHandler {
  private static observations: TranscribedObservation[] = [];

  static store(observation: TranscribedObservation): void {
    this.observations.push(observation);
    logger.log("transcription_stored", {
      id: observation.id,
      learnerId: observation.learnerId,
      textLength: observation.text.length,
      source: observation.source,
    });
  }

  static getForLearner(learnerId: string): TranscribedObservation[] {
    return this.observations.filter((obs) => obs.learnerId === learnerId);
  }

  static getAll(): TranscribedObservation[] {
    return this.observations;
  }
}

// Expose for agent access
export const transcriptionStore = TranscriptionHandler;
