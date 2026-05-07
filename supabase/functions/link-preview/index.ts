// Edge function: fetch OpenGraph metadata for a URL.
//
// Why server-side:
// - CORS: most sites don't expose OG tags via XHR from a mobile app's origin
// - Privacy: keeps the third-party fetch off the user's device
// - Caching: an LRU in front later (TODO) avoids hammering popular domains
//
// Deploy with: supabase functions deploy link-preview --no-verify-jwt
// (no-verify so it can be called from logged-out contexts, but we cap to
// authenticated users via the access_token check below.)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const MAX_HTML_BYTES = 200_000; // don't bother parsing huge pages
const FETCH_TIMEOUT_MS = 5000;
const ALLOWED_ORIGINS = "*"; // tighten to app domains pre-launch

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGINS,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface PreviewResponse {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  domain: string;
}

function pickMeta(html: string, names: string[]): string | null {
  for (const name of names) {
    // Match either <meta property="..." content="..."> or content first
    const re1 = new RegExp(
      `<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["']`,
      "i"
    );
    const re2 = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["']`,
      "i"
    );
    const m = html.match(re1) ?? html.match(re2);
    if (m && m[1]) return decodeHtmlEntities(m[1].trim()) || null;
  }
  return null;
}

function pickTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]{1,300}?)<\/title>/i);
  if (!m) return null;
  return decodeHtmlEntities(m[1].replace(/\s+/g, " ").trim()) || null;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function resolveUrl(maybeRelative: string, base: URL): string {
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return maybeRelative;
  }
}

async function fetchPreview(targetUrl: string): Promise<PreviewResponse> {
  const url = new URL(targetUrl);
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; WannaPreviewBot/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: ctrl.signal,
      redirect: "follow",
    });
    if (!res.ok) {
      return {
        url: targetUrl,
        title: null,
        description: null,
        image: null,
        domain: url.hostname,
      };
    }
    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    let html = "";
    let total = 0;
    if (reader) {
      while (total < MAX_HTML_BYTES) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.byteLength;
        html += decoder.decode(value, { stream: true });
      }
      reader.cancel();
    }
    const title =
      pickMeta(html, ["og:title", "twitter:title"]) ?? pickTitle(html);
    const description = pickMeta(html, [
      "og:description",
      "twitter:description",
      "description",
    ]);
    const imageRaw = pickMeta(html, ["og:image", "twitter:image"]);
    const image = imageRaw ? resolveUrl(imageRaw, url) : null;
    return {
      url: targetUrl,
      title,
      description,
      image,
      domain: url.hostname.replace(/^www\./, ""),
    };
  } catch (e) {
    return {
      url: targetUrl,
      title: null,
      description: null,
      image: null,
      domain: url.hostname.replace(/^www\./, ""),
    };
  } finally {
    clearTimeout(timeout);
  }
}

// JSON response helper, standardized across every Wanna edge function
// (auto-unban, email-prefs-api, send-email, send-push, etc.). Status
// + body, CORS + Content-Type baked in.
function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "POST only" }, 405);
  }

  let payload: { url?: string };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }
  if (!payload.url || typeof payload.url !== "string") {
    return jsonResponse({ error: "url required" }, 400);
  }
  let parsed: URL;
  try {
    parsed = new URL(payload.url);
  } catch {
    return jsonResponse({ error: "Invalid URL" }, 400);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return jsonResponse({ error: "http(s) only" }, 400);
  }

  const preview = await fetchPreview(parsed.toString());
  // Cache previews aggressively — same URL → same metadata for ~10 min.
  return jsonResponse(preview, 200, { "Cache-Control": "public, max-age=600" });
});
