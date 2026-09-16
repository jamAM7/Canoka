// Stand-in for the signed-in student until Supabase Auth is wired up.
// Swap this for the authenticated user once `/(auth)/sign-up` and a real
// session exist.
export const CURRENT_USER = {
  name: "Alex",
};

/** Time-of-day greeting, e.g. "Good morning". */
export function getGreeting(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
