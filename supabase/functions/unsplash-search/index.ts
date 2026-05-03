// Edge function: unsplash-search
//
// Two roles, dispatched by `action` in the POST body:
//
// 1. action: "search"  — proxies a query to api.unsplash.com/search/photos
//                        and returns a slim payload the client can render.
//                        Auth: caller must be signed-in (anon JWT).
//
// 2. action: "trigger" — fire-and-forget POST to a photo's download_location
//                        as required by Unsplash's API guidelines whenever a
//                        user "uses" a photo. Returns immediately; the result
//                        of the trigger isn't relevant to the caller.
//
// Why this exists at all (vs hitting Unsplash directly from the client):
//   - Keeps UNSPLASH_ACCESS_KEY + UNSPLASH_SECRET_KEY out of the app bundle
//   - Lets us shape the response (we only need photographer + a few sizes)
//   - Centralizes the download-trigger compliance step
//
// Deploy: supabase functions deploy unsplash-search
// Secrets: UNSPLASH_ACCESS_KEY, UNSPLASH_SECRET_KEY (already pushed)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const UNSPLASH_ACCESS_KEY = Deno.env.get("UNSPLASH_ACCESS_KEY") ?? "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Slim search result shape — everything the client needs to render a picker
// AND to satisfy compliance later (download_location, attribution).
// ---------------------------------------------------------------------------
interface UnsplashPhoto {
  id: string;
  urls: {
    thumb: string;       // ~200px — for grid
    small: string;       // ~400px
    regular: string;     // ~1080px — for activity hero
  };
  width: number;
  height: number;
  alt_description: string | null;
  user: {
    name: string;
    username: string;
    links: { html: string };
  };
  links: {
    download_location: string; // <-- required for trigger compliance
    html: string;
  };
}

function slimPhoto(p: UnsplashPhoto) {
  return {
    id: p.id,
    thumb_url: p.urls.thumb,
    small_url: p.urls.small,
    regular_url: p.urls.regular,
    width: p.width,
    height: p.height,
    alt: p.alt_description ?? "",
    photographer_name: p.user.name,
    photographer_username: p.user.username,
    photographer_url: p.user.links.html,
    photo_url: p.links.html,
    download_location: p.links.download_location,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "POST only" }, 405);

  // Authenticate the caller (signed-in user, no service-role required)
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse({ error: "missing auth" }, 401);
  }
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await anonClient.auth.getUser();
  if (userErr || !userData?.user) {
    return jsonResponse({ error: "invalid auth" }, 401);
  }

  if (!UNSPLASH_ACCESS_KEY) {
    return jsonResponse(
      { error: "UNSPLASH_ACCESS_KEY not configured on the server" },
      500
    );
  }

  let body: { action?: string; query?: string; download_location?: string; per_page?: number; page?: number };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid JSON" }, 400);
  }

  // -------------------------------------------------------------------------
  // SEARCH — proxies api.unsplash.com/search/photos
  // -------------------------------------------------------------------------
  if (body.action === "search") {
    const query = (body.query ?? "").trim();
    if (!query) return jsonResponse({ results: [], total: 0 });

    const perPage = Math.min(Math.max(body.per_page ?? 18, 1), 30);
    const page = Math.max(body.page ?? 1, 1);
    const url = new URL("https://api.unsplash.com/search/photos");
    url.searchParams.set("query", query);
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("page", String(page));
    url.searchParams.set("content_filter", "high"); // no NSFW

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
        "Accept-Version": "v1",
      },
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      console.error("Unsplash search failed:", res.status, errBody);
      return jsonResponse(
        { error: errBody?.errors?.[0] ?? `Unsplash HTTP ${res.status}` },
        502
      );
    }

    const data = await res.json();
    const results: UnsplashPhoto[] = data.results ?? [];
    return jsonResponse({
      results: results.map(slimPhoto),
      total: data.total ?? 0,
      total_pages: data.total_pages ?? 0,
      page,
    });
  }

  // -------------------------------------------------------------------------
  // TRIGGER — fire-and-forget download beacon (compliance requirement)
  // Called when a user actually selects a photo for use.
  // -------------------------------------------------------------------------
  if (body.action === "trigger") {
    const downloadLocation = body.download_location ?? "";
    if (!downloadLocation || !downloadLocation.startsWith("https://api.unsplash.com/")) {
      return jsonResponse({ error: "invalid download_location" }, 400);
    }
    // Don't block the caller on this. Fire and return immediately.
    queueMicrotask(async () => {
      try {
        const res = await fetch(downloadLocation, {
          headers: {
            Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
            "Accept-Version": "v1",
          },
        });
        if (!res.ok) {
          console.warn("Unsplash trigger non-2xx:", res.status, downloadLocation);
        }
      } catch (e) {
        console.warn("Unsplash trigger threw:", e);
      }
    });
    return jsonResponse({ status: "triggered" });
  }

  return jsonResponse(
    { error: 'unknown action — must be "search" or "trigger"' },
    400
  );
});
