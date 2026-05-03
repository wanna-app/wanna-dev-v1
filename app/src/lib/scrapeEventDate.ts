// scrapeEventDate — best-effort client-side scrape to pull a start date
// out of an event listing page (Eventbrite, Ticketmaster, Yelp, etc).
//
// This runs from the device, so anything behind CSRF / heavy JS rendering
// will quietly fail and we return null. The caller treats null as "no
// auto-fill, the user will pick manually" — so failure is graceful.

const FETCH_TIMEOUT_MS = 6000;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

// Patterns checked in priority order. Each is a single regex run against
// the full HTML body. We capture the first ISO-ish date string and try
// `new Date()` on it.
const PATTERNS: RegExp[] = [
  // 1. JSON-LD: <script type="application/ld+json"> ... "startDate":"<ISO>" ...
  //    Most major event platforms (Eventbrite, Ticketmaster) emit
  //    schema.org Event JSON-LD with a `startDate` field. We don't try
  //    to parse the JSON properly — just grab the first occurrence.
  /"startDate"\s*:\s*"([^"]+)"/,
  // 2. OpenGraph event start time meta tag.
  /<meta[^>]+property=["']event:start_time["'][^>]+content=["']([^"']+)["']/i,
  // 3. Microdata itemprop fallback.
  /<meta[^>]+itemprop=["']startDate["'][^>]+content=["']([^"']+)["']/i,
];

export async function scrapeEventDate(url: string): Promise<Date | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const html = await res.text();

    for (const re of PATTERNS) {
      const m = html.match(re);
      if (m && m[1]) {
        const d = new Date(m[1]);
        if (!isNaN(d.getTime())) return d;
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
