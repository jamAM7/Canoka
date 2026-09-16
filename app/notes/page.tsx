// Notes overview: list of subjects -> weeks.
// TODO: subject/week list, pulled from `subjects` + `notes`.
import { ComingSoon } from "@/components/shell/ComingSoon";

export const metadata = { title: "Notes · Canoka" };

export default function NotesPage() {
  return (
    <ComingSoon
      active="notes"
      title="Notes"
      description="AI-generated notes for each subject and week, built from your Canvas content."
    />
  );
}
