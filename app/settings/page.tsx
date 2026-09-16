// Settings: Canvas connection, calendar subscriptions, notification prefs.
// TODO: settings form.
import { ComingSoon } from "@/components/shell/ComingSoon";

export const metadata = { title: "Settings · Canoka" };

export default function SettingsPage() {
  return (
    <ComingSoon
      active="settings"
      title="Settings"
      description="Connect Canvas, manage calendar subscriptions and choose your notification preferences."
    />
  );
}
