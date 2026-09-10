"""HTTP layer for the Canvas LMS REST API.

Handles the four things that make naive Canvas scrapers fail:
  * Link-header pagination (default page size is 10, not "all")
  * leaky-bucket throttling (403/429 + X-Rate-Limit-Remaining)
  * endpoints that 403 because staff hid the tab, not because you lack a token
  * re-running the script without re-hammering the API (disk cache)

Safe to call from several threads: page bodies and inline file metadata are one
request each, so the build fetches them concurrently.
"""

from __future__ import annotations

import hashlib
import json
import re
import threading
import time
from pathlib import Path
from typing import Any, Iterator
from urllib.parse import urljoin

import requests

# Canvas returns numeric IDs that exceed JS safe-integer range. Asking for
# string IDs keeps them stable everywhere downstream.
ACCEPT = "application/json+canvas-string-ids, application/json"

HOUR = 3600.0
DAY = 24 * HOUR

# How long a cached response stays usable. Keyed on the endpoint rather than one
# global number, because staleness costs differently per endpoint: a new
# announcement missed for a week is a bug, a module list re-fetched every run is
# just waste. `None` means never expires.
CACHE_TTL: tuple[tuple[re.Pattern, float | None], ...] = (
    # File metadata is immutable — Canvas issues a new id when a file changes.
    (re.compile(r"/api/v1/files/\d+$"), None),
    # Carry your submission state and staff's latest posts.
    (re.compile(r"/discussion_topics"), HOUR),
    (re.compile(r"/assignments"), HOUR),
    (re.compile(r"/submissions"), HOUR),
    # Staff edit these across a session, but not hourly.
    (re.compile(r"/(pages|modules|assignment_groups|files|tabs|quizzes|external_tools)"), 7 * DAY),
)
DEFAULT_TTL = DAY


class CanvasError(RuntimeError):
    def __init__(self, status: int, url: str, message: str = ""):
        self.status = status
        self.url = url
        self.message = message
        super().__init__(f"HTTP {status} for {url}: {message}"[:400])


class CanvasForbidden(CanvasError):
    """403/401 — usually a hidden course tab, not a bad token."""


class CanvasNotFound(CanvasError):
    pass


class CanvasClient:
    def __init__(
        self,
        base_url: str,
        token: str,
        cache_dir: str | Path | None = None,
        refresh: bool = False,
        min_interval: float = 0.08,
        timeout: int = 30,
        max_retries: int = 5,
        verbose: bool = True,
    ):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.max_retries = max_retries
        self.min_interval = min_interval
        self.refresh = refresh
        self.verbose = verbose
        self._last_request = 0.0
        self.request_count = 0
        # Guards the pacing gate and the counter. Held only around bookkeeping,
        # never across a request, so concurrent callers still overlap on the wire.
        self._gate = threading.Lock()
        self._token = token
        self._local = threading.local()

        self.cache_dir = Path(cache_dir) if cache_dir else None
        if self.cache_dir:
            self.cache_dir.mkdir(parents=True, exist_ok=True)

    @property
    def session(self) -> requests.Session:
        """One Session per thread — requests.Session isn't safe to share."""
        existing = getattr(self._local, "session", None)
        if existing is None:
            existing = requests.Session()
            existing.headers.update(
                {"Authorization": f"Bearer {self._token}", "Accept": ACCEPT}
            )
            self._local.session = existing
        return existing

    # ---------------------------------------------------------------- caching

    def _cache_path(self, url: str, params: dict | None) -> Path | None:
        if not self.cache_dir:
            return None
        key = json.dumps([url, sorted((params or {}).items(), key=str)], default=str)
        return self.cache_dir / f"{hashlib.sha1(key.encode()).hexdigest()}.json"

    @staticmethod
    def _ttl_for(url: str) -> float | None:
        for pattern, ttl in CACHE_TTL:
            if pattern.search(url):
                return ttl
        return DEFAULT_TTL

    def _read_cache(self, cache_file: Path, url: str) -> tuple[Any, dict] | None:
        """A cached response, or None when it's missing, stale or unreadable.

        Entries written before caching grew a clock have no `fetched_at`. They
        are treated as stale rather than as fresh-forever: one extra pull beats
        a cache that silently never expires part of itself.
        """
        try:
            cached = json.loads(cache_file.read_text())
        except (OSError, ValueError):
            return None
        ttl = self._ttl_for(url)
        if ttl is not None:
            stamp = cached.get("fetched_at")
            if not isinstance(stamp, (int, float)) or time.time() - stamp > ttl:
                return None
        return cached["body"], cached["headers"]

    # ------------------------------------------------------------- throttling

    def _pace(self) -> None:
        """Claim the next request slot, sleeping if it isn't due yet.

        Each caller reserves its slot under the lock before going out on the
        wire, so N threads still leave `min_interval` between requests overall
        while their network waits overlap. Timing from the claim rather than
        from the previous response is what makes that hold.
        """
        with self._gate:
            gap = time.monotonic() - self._last_request
            if gap < self.min_interval:
                time.sleep(self.min_interval - gap)
            self._last_request = time.monotonic()

    def _respect_rate_limit(self, response: requests.Response) -> None:
        raw = response.headers.get("X-Rate-Limit-Remaining")
        if not raw:
            return
        try:
            remaining = float(raw)
        except ValueError:
            return
        # Default bucket is ~700 and refills faster than real time. Well before
        # empty, slow down rather than eat a 403 and a backoff.
        if remaining < 100:
            self._log(f"  rate limit low ({remaining:.0f}), pausing 5s")
            time.sleep(5)

    def _is_throttled(self, response: requests.Response) -> bool:
        if response.status_code == 429:
            return True
        # Canvas historically returned 403 with this body for throttling.
        return response.status_code == 403 and "rate limit" in response.text.lower()

    # ------------------------------------------------------------------- core

    def _log(self, msg: str) -> None:
        if self.verbose:
            print(msg, flush=True)

    def get(self, path: str, params: dict | None = None) -> tuple[Any, dict]:
        """GET one URL. Returns (parsed_body, headers). Raises CanvasError."""
        url = path if path.startswith("http") else urljoin(self.base_url + "/", path.lstrip("/"))

        cache_file = self._cache_path(url, params)
        if cache_file and cache_file.exists() and not self.refresh:
            hit = self._read_cache(cache_file, url)
            if hit is not None:
                return hit

        delay = 2.0
        for attempt in range(self.max_retries):
            self._pace()

            try:
                response = self.session.get(url, params=params, timeout=self.timeout)
            except requests.RequestException as exc:
                if attempt == self.max_retries - 1:
                    raise CanvasError(0, url, str(exc)) from exc
                time.sleep(delay)
                delay *= 2
                continue

            with self._gate:
                self.request_count += 1

            if self._is_throttled(response):
                self._log(f"  throttled, backing off {delay:.0f}s")
                time.sleep(delay)
                delay *= 2
                continue

            if response.status_code in (401, 403):
                raise CanvasForbidden(response.status_code, url, response.text[:200])
            if response.status_code == 404:
                raise CanvasNotFound(404, url, response.text[:200])
            if response.status_code >= 500:
                if attempt == self.max_retries - 1:
                    raise CanvasError(response.status_code, url, response.text[:200])
                time.sleep(delay)
                delay *= 2
                continue
            if not response.ok:
                raise CanvasError(response.status_code, url, response.text[:200])

            self._respect_rate_limit(response)

            try:
                body = response.json()
            except ValueError as exc:
                raise CanvasError(response.status_code, url, "response was not JSON") from exc

            headers = {"link": response.headers.get("Link", "")}
            if cache_file:
                cache_file.write_text(json.dumps(
                    {"url": url, "fetched_at": time.time(), "body": body, "headers": headers}
                ))
            return body, headers

        raise CanvasError(429, url, "exhausted retries while throttled")

    def paginate(self, path: str, params: dict | None = None) -> Iterator[dict]:
        """Yield every item across all pages, following Link rel=next."""
        params = dict(params or {})
        params.setdefault("per_page", 100)
        url: str | None = path

        while url:
            body, headers = self.get(url, params)
            if isinstance(body, list):
                yield from body
            elif isinstance(body, dict):
                yield body
            # Next-page links are opaque and already carry every parameter.
            params = None
            url = self._next_link(headers.get("link", ""))

    @staticmethod
    def _next_link(link_header: str) -> str | None:
        if not link_header:
            return None
        for link in requests.utils.parse_header_links(link_header.rstrip(">").replace(">,<", ">, <")):
            if link.get("rel") == "next":
                return link.get("url")
        return None

    def get_list(self, path: str, params: dict | None = None) -> list[dict]:
        return list(self.paginate(path, params))

    def download(self, url: str, dest: Path) -> int:
        """Stream a file to disk. Canvas file URLs are pre-signed and expire."""
        dest.parent.mkdir(parents=True, exist_ok=True)
        self._pace()
        with self.session.get(url, stream=True, timeout=self.timeout) as response:
            response.raise_for_status()
            size = 0
            with open(dest, "wb") as handle:
                for chunk in response.iter_content(1 << 16):
                    handle.write(chunk)
                    size += len(chunk)
        with self._gate:
            self.request_count += 1
        return size
