// PUT /api/ai/key  { apiKey }
// Saves the Anthropic API key to llm/.env for AI review of notes (and the
// scripts in llm/). The key is never sent back to the browser.
import { NextResponse } from "next/server";
import { saveAnthropicKey } from "@/lib/ai/key";
import { refuseUnlessLocal } from "@/lib/guard";

export async function PUT(request: Request) {
  const refused = refuseUnlessLocal(request);
  if (refused) return refused;

  try {
    saveAnthropicKey(await request.json());
    return NextResponse.json({ saved: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
