import { NextResponse } from "next/server";

// Routes that run Python or write credentials on this machine (the scraper,
// AI review of notes) only answer in development, and only change anything
// for requests from the app's own pages.

/** A response refusing the request, or null to go ahead. */
export function refuseUnlessLocal(request: Request): NextResponse | null {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "This only works while running the app locally (npm run dev)." },
      { status: 403 },
    );
  }
  // Browsers send Origin with POST, PUT and DELETE, so this stops other sites from making them.
  if (request.method !== "GET" && !sameOrigin(request)) {
    return NextResponse.json({ error: "Requests must come from this app." }, { status: 403 });
  }
  return null;
}

function sameOrigin(request: Request): boolean {
  try {
    return new URL(request.headers.get("origin") ?? "").host === request.headers.get("host");
  } catch {
    return false;
  }
}
