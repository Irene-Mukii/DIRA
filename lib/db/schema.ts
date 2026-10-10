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
  created_at: Date;
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
