// The Settings page's scraper controls.
//   GET    /api/scraper?run=<id>&since=<line>  the current or last scrape, and its new output
//   POST   /api/scraper  { ...ScrapeOptions }  start a scrape, one at a time
//   DELETE /api/scraper                        stop the running scrape
// It runs scraper/scrape.py on this machine with the Canvas token in
// scraper/.env, so lib/scraper/guard limits who can use it.
import { NextResponse } from "next/server";
import { parseScrapeOptions, type ScrapeOptions } from "@/lib/scraper/cli";
import { refuseScraperRequest } from "@/lib/scraper/guard";
import { ScrapeBusyError, scrapeProgress, startScrape, stopScrape } from "@/lib/scraper/runner";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const refused = refuseScraperRequest(request);
  if (refused) return refused;

  const params = new URL(request.url).searchParams;
  return NextResponse.json(scrapeProgress(Number(params.get("run")), Number(params.get("since")) || 0));
}

export async function POST(request: Request) {
  const refused = refuseScraperRequest(request);
  if (refused) return refused;

  let options: ScrapeOptions;
  try {
    options = parseScrapeOptions(await request.json());
  } catch (error) {
    return NextResponse.json({ error: messageOf(error) }, { status: 400 });
  }

  try {
    startScrape(options);
    return NextResponse.json(scrapeProgress(), { status: 202 });
  } catch (error) {
    const status = error instanceof ScrapeBusyError ? 409 : 500;
    return NextResponse.json({ error: messageOf(error), ...scrapeProgress() }, { status });
  }
}

export async function DELETE(request: Request) {
  const refused = refuseScraperRequest(request);
  if (refused) return refused;

  if (!stopScrape()) return NextResponse.json({ error: "No scrape is running." }, { status: 409 });
  return NextResponse.json(scrapeProgress());
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
