"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export function AccountSettings() {
  const router = useRouter();

  async function logOut() {
    if (isSupabaseConfigured()) await createClient().auth.signOut();
    window.localStorage.removeItem("canoka-onboarding");
    router.replace("/sign-up");
    router.refresh();
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      <h2 className="text-xl font-semibold text-text">Account</h2>
      <div className="mt-4 flex max-w-xl items-center justify-between gap-6 border-t border-border-light pt-4">
        <div>
          <p className="text-sm font-medium text-text">Log out of Canoka</p>
          <p className="mt-0.5 text-xs text-text-muted">You&apos;ll return to account setup on this device.</p>
        </div>
        <button
          type="button"
          onClick={logOut}
          className="shrink-0 rounded-md border border-error px-3 py-1.5 text-sm font-medium text-error transition-colors hover:bg-error hover:text-white"
        >
          Log out
        </button>
      </div>
    </section>
  );
}
