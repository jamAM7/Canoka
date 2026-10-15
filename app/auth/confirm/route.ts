import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const code = request.nextUrl.searchParams.get("code");
  const redirect = request.nextUrl.clone();
  redirect.search = "";

  if ((tokenHash && type) || code) {
    const supabase = createClient();
    const { error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({ type: type!, token_hash: tokenHash! });
    if (!error) {
      redirect.pathname = "/dashboard";
      return NextResponse.redirect(redirect);
    }
  }

  redirect.pathname = "/sign-up";
  redirect.searchParams.set("error", "That confirmation link is invalid or has expired.");
  return NextResponse.redirect(redirect);
}
