import "server-only";

// The Canvas LMS REST API, spoken the way scraper/canvas/client.py speaks it:
// string ids, Link-header pagination, and backing off when Canvas throttles.
// There's no response cache: the hosted site has no disk to keep one on, and
// a sync is a few dozen requests at most. Server-only: it holds the token.

// Canvas returns numeric ids past JS's safe-integer range. Asking for string ids keeps them exact.
const ACCEPT = "application/json+canvas-string-ids, application/json";
const TIMEOUT_MS = 20_000;
const ATTEMPTS = 3;
/** Requests at once for one-per-item lookups such as page bodies, as scraper/canvas/build.py's MAX_WORKERS. */
export const MAX_WORKERS = 6;

export type Params = Record<string, string | number | string[]>;

export class CanvasError extends Error {
  constructor(
    /** The HTTP status, or 0 when Canvas couldn't be reached. */
    readonly status: number,
    /** The API path asked for, without the host or query. */
    readonly path: string,
    message: string,
  ) {
    super(message);
  }

  /** 401 or 403: usually a tab or item staff have hidden, not a bad token. */
  get forbidden(): boolean {
    return this.status === 401 || this.status === 403;
  }

  /** Canvas turned the token itself down (wrong, expired or deleted), so nothing else will work either. */
  get badToken(): boolean {
    return this.status === 401 && /access token/i.test(this.message);
  }
}

export interface CanvasClient {
  /** The Canvas site, an https origin with no trailing slash. */
  baseUrl: string;
  get<T>(path: string, params?: Params): Promise<T>;
  /** Every item across all pages of a list endpoint. */
  list<T>(path: string, params?: Params): Promise<T[]>;
}

export function canvasClient(baseUrl: string, token: string): CanvasClient {
  const origin = new URL(baseUrl).origin;

  async function fetchJson(url: URL): Promise<{ body: unknown; link: string | null }> {
    let delay = 2_000;
    for (let attempt = 1; ; attempt++) {
      const last = attempt === ATTEMPTS;
      let response: Response;
      try {
        response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}`, Accept: ACCEPT },
          cache: "no-store",
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (error) {
        if (last) throw new CanvasError(0, url.pathname, `Couldn't reach Canvas: ${reasonOf(error)}`);
        await sleep(delay);
        delay *= 2;
        continue;
      }

      if (response.ok) {
        await respectRateLimit(response);
        try {
          return { body: await response.json(), link: response.headers.get("link") };
        } catch {
          throw new CanvasError(response.status, url.pathname, `Canvas didn't answer ${url.pathname} with JSON.`);
        }
      }

      const text = await response.text().catch(() => "");
      // Canvas has answered throttling with 403 and this text as well as with 429.
      const throttled = response.status === 429 || (response.status === 403 && /rate limit/i.test(text));
      if ((throttled || response.status >= 500) && !last) {
        await sleep(delay);
        delay *= 2;
        continue;
      }
      throw new CanvasError(response.status, url.pathname, `HTTP ${response.status} for ${url.pathname}: ${canvasMessage(text)}`);
    }
  }

  function urlFor(path: string, params: Params = {}): URL {
    const url = new URL(path, `${origin}/`);
    for (const [key, value] of Object.entries(params)) {
      for (const item of Array.isArray(value) ? value : [value]) url.searchParams.append(key, String(item));
    }
    return url;
  }

  return {
    baseUrl: origin,

    async get<T>(path: string, params?: Params): Promise<T> {
      return (await fetchJson(urlFor(path, params))).body as T;
    },

    async list<T>(path: string, params: Params = {}): Promise<T[]> {
      const items: T[] = [];
      let url: URL | null = urlFor(path, { per_page: 100, ...params });
      while (url) {
        const { body, link }: { body: unknown; link: string | null } = await fetchJson(url);
        if (Array.isArray(body)) items.push(...(body as T[]));
        else if (body && typeof body === "object") items.push(body as T);
        // Next-page links already carry every parameter. The token only ever goes to this Canvas.
        const next = nextLink(link);
        url = next && new URL(next).origin === origin ? new URL(next) : null;
      }
      return items;
    },
  };
}

/** `fn` over every item, `limit` at a time, results in the items' order. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** The rel="next" URL of a Link header, if there is one. */
function nextLink(header: string | null): string | null {
  for (const part of header?.split(/,\s*(?=<)/) ?? []) {
    const match = /^<([^>]+)>\s*;.*\brel="?next"?/.exec(part.trim());
    if (match) return match[1];
  }
  return null;
}

/** The bucket refills faster than real time, but slow down well before it's empty, as client.py does. */
async function respectRateLimit(response: Response) {
  const remaining = Number(response.headers.get("x-rate-limit-remaining") ?? "");
  if (response.headers.has("x-rate-limit-remaining") && Number.isFinite(remaining) && remaining < 100) {
    await sleep(5_000);
  }
}

/** Canvas's own error message from a response body, e.g. `{"errors":[{"message":"Invalid access token."}]}`. */
function canvasMessage(text: string): string {
  try {
    const body = JSON.parse(text) as { errors?: { message?: string }[] | Record<string, unknown>; message?: string };
    const first = Array.isArray(body.errors) ? body.errors[0]?.message : undefined;
    if (first || body.message) return String(first ?? body.message).slice(0, 200);
  } catch {
    // Not JSON: an HTML error page, say.
  }
  return text.replace(/\s+/g, " ").trim().slice(0, 200) || "no message";
}

function reasonOf(error: unknown): string {
  if (error instanceof Error && error.name === "TimeoutError") return `no answer within ${TIMEOUT_MS / 1000} seconds`;
  const cause = error instanceof Error ? (error.cause as { code?: string } | undefined) : undefined;
  return cause?.code ?? (error instanceof Error ? error.message : String(error));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
