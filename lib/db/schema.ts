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

export const ATTENDANCE_STATUSES = [
  "present",
  "late",
  "absent",
  "excused",
  "unknown",
] as const;

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export interface LogObservationInput {
  learner_id: string;
  observation_type: ObservationType;
  content: string;
  observed_at: string;
  calendar_entry_id?: string;
  subject?: string;
  term?: string;
  activity_context?: string;
  linked_test_id?: string;
  capture_method: CaptureMethod;
  submission_id: string;
  recording_reference?: string;
  transcript_text?: string;
  transcription_provider?: string;
}

export interface LogObservationContext {
  teacher_id: string;
  school_id: string;
}

export interface ObservationRecord {
  observation_id: string;
  learner_id: string;
  teacher_id: string;
  school_id: string;
  class_id: string;
  academic_year: number;
  observation_date: string;
  observed_at: Date;
  term: string | null;
  calendar_entry_id: string | null;
  observation_type: ObservationType;
  original_observation: string;
  subject: string | null;
  activity_context: string | null;
  source_type: string;
  capture_method: CaptureMethod;
  possible_theme: string | null;
  verification_status: string;
  submission_id: string;
  linked_test_id: string | null;
  recording_reference: string | null;
  transcript_text: string | null;
  transcription_provider: string | null;
  transcription_status: string | null;
  teacher_review_status: "not_required" | "recorded" | "confirmed" | "updated";
  reviewed_observation: string | null;
  reviewed_by_teacher_id: string | null;
  reviewed_at: Date | null;
  created_at: Date;
}

export interface ReviewObservationInput {
  submission_id: string;
  review_status: "confirmed" | "updated";
  content?: string;
  observation_type?: ObservationType;
  linked_test_id?: string | null;
}

export interface LearnerSummary {
  learner_id: string;
  display_name: string;
  class_id: string;
  grade_level: string;
  stream_label: string;
  academic_year: number;
  observation_count: number;
  last_observed_at: Date | null;
  tests_suggested: number;
}
