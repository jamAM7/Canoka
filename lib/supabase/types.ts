// Row shapes for the tables the app reads and writes, from
// docs/supabase-schema.json and docs/supabase-enums.json. Hand-written: update
// them with the schema docs when a migration changes a table. Timestamps are
// ISO strings, dates are "YYYY-MM-DD", numerics come back as numbers.

export type EnrolmentStatus = "active" | "completed" | "inactive";
export type ContentType = "page" | "file" | "assignment" | "quiz" | "discussion" | "link" | "lecture" | "other";
export type NoteType =
  | "personal"
  | "ai_generated"
  | "ai_assisted"
  | "lecture"
  | "summary"
  | "exam_revision"
  | "critical_notes";
export type NoteCreator = "student" | "ai" | "student_and_ai";
export type AssignmentProgressStatus = "not_started" | "in_progress" | "completed" | "submitted" | "graded";
export type StudyTaskStatus = "pending" | "in_progress" | "completed" | "skipped";
export type StudyPlanStatus = "draft" | "active" | "completed" | "archived";

export interface UserRow {
  id: string;
  auth_user_id: string | null;
  email: string;
  full_name: string | null;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface InstitutionRow {
  id: string;
  name: string;
  canvas_base_url: string | null;
  created_at: string;
}

export interface CourseRow {
  id: string;
  institution_id: string;
  lms_provider: string;
  external_course_id: string;
  course_code: string | null;
  name: string;
  term_name: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface CourseEnrolmentRow {
  id: string;
  user_id: string;
  course_id: string;
  external_enrolment_id: string | null;
  enrolment_type: string;
  status: EnrolmentStatus;
  enrolled_at: string;
  last_verified_at: string | null;
}

export interface CourseModuleRow {
  id: string;
  course_id: string;
  external_module_id: string;
  name: string;
  position: number | null;
  unlock_at: string | null;
  published: boolean;
  /** Generated from a "Week N" in `name` (migration course_modules_week_number). Null if it names none. */
  week_number: number | null;
  created_at: string;
  updated_at: string;
}

export interface CourseContentRow {
  id: string;
  course_id: string;
  module_id: string | null;
  external_content_id: string;
  content_type: ContentType;
  title: string;
  description: string | null;
  body_text: string | null;
  source_url: string | null;
  position: number | null;
  published: boolean;
  available_from: string | null;
  available_until: string | null;
  content_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssignmentRow {
  id: string;
  course_id: string;
  course_content_id: string | null;
  external_assignment_id: string;
  name: string;
  description: string | null;
  due_at: string | null;
  available_from: string | null;
  available_until: string | null;
  points_possible: number | null;
  assignment_group: string | null;
  weight: number | null;
  created_at: string;
  updated_at: string;
}

export interface StudentAssignmentProgressRow {
  id: string;
  user_id: string;
  assignment_id: string;
  status: AssignmentProgressStatus;
  progress_percent: number;
  score: number | null;
  submitted_at: string | null;
  completed_at: string | null;
  updated_at: string;
}

export interface StudyPlanRow {
  id: string;
  user_id: string;
  name: string;
  start_date: string;
  end_date: string;
  generated_by: string;
  status: StudyPlanStatus;
  created_at: string;
  updated_at: string;
}

export interface StudyTaskRow {
  id: string;
  study_plan_id: string;
  course_id: string | null;
  course_content_id: string | null;
  assignment_id: string | null;
  title: string;
  description: string | null;
  scheduled_date: string | null;
  scheduled_start: string | null;
  estimated_minutes: number | null;
  priority: number;
  status: StudyTaskStatus;
  reason: string | null;
  order_index: number | null;
  created_at: string;
  updated_at: string;
}

export interface NoteRow {
  id: string;
  user_id: string;
  course_id: string;
  module_id: string | null;
  course_content_id: string | null;
  title: string;
  /** A TipTap document. */
  content: unknown;
  plain_text: string | null;
  note_type: NoteType;
  created_by: NoteCreator;
  is_pinned: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface WeekReviewRow {
  id: string;
  user_id: string;
  course_id: string;
  module_id: string;
  /** The review: lib/ai/review's NotesReview. */
  content: unknown;
  model_name: string | null;
  note_count: number;
  had_course_content: boolean;
  content_stale: boolean;
  content_updated_at: string | null;
  created_at: string;
}

export interface StudyPreferencesRow {
  id: string;
  user_id: string;
  preferred_session_minutes: number;
  max_daily_minutes: number;
  /** "HH:MM:SS", local time. */
  preferred_start_time: string | null;
  preferred_end_time: string | null;
  /** Weekdays the student studies on; the default is [1, 2, 3, 4, 5]. */
  study_days: number[];
  created_at: string;
  updated_at: string;
}
