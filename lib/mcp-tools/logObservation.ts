// Actual logic for logging observations
// Imported by the route above

import { TranscriptionHandler } from "../agent/transcription-handler";

export interface LogObservationInput {
  learnerId: string;
  observationType: string;
  content: string;
  captureMethod: "text" | "voice";
}

export async function logObservation(input: LogObservationInput) {
  const observation = {
    id: `obs_${Date.now()}`,
    learnerId: input.learnerId,
    text: input.content,
    timestamp: new Date(),
    source: input.captureMethod,
  };

  TranscriptionHandler.store(observation);

  return {
    success: true,
    observationId: observation.id,
    data: observation,
  };
}
