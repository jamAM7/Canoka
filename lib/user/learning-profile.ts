import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export interface LearningProfile {
  studyLevel: string | null;
  studyGoal: string | null;
  learningModes: string[];
  noteDepth: string | null;
  supportStyle: string | null;
}

export async function loadLearningProfile(): Promise<LearningProfile | null> {
  if (!isSupabaseConfigured()) return legacyProfile();
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("study_level, study_goal, learning_modes, note_depth, support_style")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    studyLevel: data.study_level,
    studyGoal: data.study_goal,
    learningModes: Array.isArray(data.learning_modes) ? data.learning_modes : [],
    noteDepth: data.note_depth,
    supportStyle: data.support_style,
  };
}

function legacyProfile(): LearningProfile | null {
  try {
    const value = JSON.parse(window.localStorage.getItem("canoka-onboarding") ?? "null");
    if (!value || typeof value !== "object") return null;
    return {
      studyLevel: typeof value.studyLevel === "string" ? value.studyLevel : null,
      studyGoal: typeof value.studyGoal === "string" ? value.studyGoal : null,
      learningModes: Array.isArray(value.learningModes) ? value.learningModes : [],
      noteDepth: typeof value.noteDepth === "string" ? value.noteDepth : null,
      supportStyle: typeof value.supportStyle === "string" ? value.supportStyle : null,
    };
  } catch {
    return null;
  }
}
