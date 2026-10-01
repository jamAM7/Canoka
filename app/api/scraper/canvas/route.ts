// PUT /api/scraper/canvas  { baseUrl, token? }
// Saves the Canvas address and access token to scraper/.env, where scrape.py
// reads them. An empty token keeps the saved one. The token is never sent back.
import { NextResponse } from "next/server";
import { saveCanvasSettings } from "@/lib/scraper/env";
import { refuseScraperRequest } from "@/lib/scraper/guard";

export async function PUT(request: Request) {
  const refused = refuseScraperRequest(request);
  if (refused) return refused;

  try {
    return NextResponse.json({ canvasUrl: saveCanvasSettings(await request.json()) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
