export const OBSERVATION_TYPES = [
  "participation",
  "academic",
  "behavioral",
  "attendance",
  "extracurricular",
  "test_result",
  "other",
] as const;

export type ObservationType = (typeof OBSERVATION_TYPES)[number];

export const CAPTURE_METHODS = [
  "text",
  "in_app_voice",
  "basic_phone_callback",
  "other",
] as const;

export type CaptureMethod = (typeof CAPTURE_METHODS)[number];

export interface LogObservationInput {
  learner_id: string;
  observation_type: ObservationType;
  content: string;
  subject?: string;
  term?: string;
  observed_at?: string;
  linked_test_id?: string;
  capture_method: CaptureMethod;
  submission_id: string;
}

export interface ObservationRecord {
  observation_id: string;
  learner_id: string;
  observer_id: string;
  observer_role: string | null;
  observation_type: ObservationType;
  content_original: string;
  subject: string | null;
  term: string | null;
  observed_at: Date | null;
  created_at: Date;
  capture_method: CaptureMethod;
  submission_id: string;
  linked_test_id: string | null;
}
