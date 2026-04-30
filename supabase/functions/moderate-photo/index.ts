// Edge function: scan a freshly-uploaded profile photo via Google Cloud
// Vision SafeSearch. If LIKELY+ on adult / violence / racy, the photo is
// removed from the user's profile.photos array immediately and a
// photo_moderation row is queued for human review.
//
// IMPORTANT: skips Vision entirely for seed/demo users (PRD AC-SD-06 +
// preserves Cloud Vision credit budget). The skip happens both
// client-side (we don't even invoke for is_seed users) and here as a
// belt-and-suspenders check.
//
// Deploy:  supabase functions deploy moderate-photo
// Secret:  supabase secrets set GCP_VISION_API_KEY=...

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const GCP_VISION_API_KEY = Deno.env.get("GCP_VISION_API_KEY") ?? "";

const FLAGGED_LIKELIHOODS = new Set(["LIKELY", "VERY_LIKELY"]);
// PRD §7.4: adult / violence / racy are the three categories used.
const SCORED_CATEGORIES = ["adult", "violence", "racy"] as const;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ModerationResponse {
  result: "allowed" | "flagged" | "skipped" | "error";
  flagged_categories: string[];
  reason?: string;
}

function jsonResponse(body: ModerationResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function downloadImage(
  supabase: ReturnType<typeof createClient>,
  bucket: string,
  path: string
): Promise<{ base64: string; size: number } | null> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    console.warn("download error:", error?.message);
    return null;
  }
  const buf = await data.arrayBuffer();
  // Vision API supports up to 20 MB per image. Our bucket caps at 10 MB.
  if (buf.byteLength === 0) return null;
  // base64 encode without blowing the stack on large inputs
  let bin = "";
  const bytes = new Uint8Array(buf);
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return { base64: btoa(bin), size: buf.byteLength };
}

interface SafeSearchAnnotation {
  adult: string;
  spoof: string;
  medical: string;
  violence: string;
  racy: string;
}

async function callVision(
  base64: string
): Promise<SafeSearchAnnotation | null> {
  if (!GCP_VISION_API_KEY) {
    console.warn("GCP_VISION_API_KEY missing — skipping Vision call");
    return null;
  }
  const res = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${GCP_VISION_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            image: { content: base64 },
            features: [{ type: "SAFE_SEARCH_DETECTION" }],
          },
        ],
      }),
    }
  );
  if (!res.ok) {
    console.warn("Vision API non-200:", res.status, await res.text());
    return null;
  }
  const body = await res.json();
  const err = body?.responses?.[0]?.error;
  if (err) {
    console.warn("Vision API responded with error:", err?.message);
    return null;
  }
  return body?.responses?.[0]?.safeSearchAnnotation ?? null;
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST")
    return jsonResponse(
      { result: "error", flagged_categories: [], reason: "POST only" },
      405
    );

  // Authenticated client — pass through the user's JWT so RLS applies.
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse(
      { result: "error", flagged_categories: [], reason: "missing auth" },
      401
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return jsonResponse(
      { result: "error", flagged_categories: [], reason: "invalid auth" },
      401
    );
  }
  const userId = userData.user.id;

  let body: { path?: string; bucket?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse(
      { result: "error", flagged_categories: [], reason: "invalid JSON" },
      400
    );
  }
  const path = body.path;
  const bucket = body.bucket ?? "profile-photos";
  if (!path || typeof path !== "string") {
    return jsonResponse(
      { result: "error", flagged_categories: [], reason: "path required" },
      400
    );
  }
  // The path must start with the user's own UUID folder (matches the bucket
  // RLS policy already in place).
  if (!path.startsWith(`${userId}/`)) {
    return jsonResponse(
      { result: "error", flagged_categories: [], reason: "path not yours" },
      403
    );
  }

  // Belt-and-suspenders: skip Vision entirely for seed users.
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("is_seed")
    .eq("id", userId)
    .maybeSingle();
  if (profileRow?.is_seed === true) {
    return jsonResponse({
      result: "skipped",
      flagged_categories: [],
      reason: "seed user",
    });
  }

  // Download + scan
  const img = await downloadImage(supabase, bucket, path);
  if (!img) {
    await supabase.from("photo_moderation").insert({
      user_id: userId,
      photo_path: path,
      bucket,
      result: "error",
    });
    return jsonResponse({
      result: "error",
      flagged_categories: [],
      reason: "couldn't download image",
    });
  }

  const sa = await callVision(img.base64);
  if (!sa) {
    await supabase.from("photo_moderation").insert({
      user_id: userId,
      photo_path: path,
      bucket,
      result: "error",
    });
    return jsonResponse({
      result: "error",
      flagged_categories: [],
      reason: "Vision API failed",
    });
  }

  const flaggedCategories: string[] = SCORED_CATEGORIES.filter((cat) =>
    FLAGGED_LIKELIHOODS.has((sa as Record<string, string>)[cat])
  );
  const flagged = flaggedCategories.length > 0;

  // Record the verdict
  await supabase.from("photo_moderation").insert({
    user_id: userId,
    photo_path: path,
    bucket,
    result: flagged ? "flagged" : "allowed",
    adult_likelihood: sa.adult,
    violence_likelihood: sa.violence,
    racy_likelihood: sa.racy,
    spoof_likelihood: sa.spoof,
    medical_likelihood: sa.medical,
    flagged_categories: flagged ? flaggedCategories : null,
  });

  // If flagged, remove from the user's photos array immediately so the
  // image stops being shown.
  if (flagged) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("photos")
      .eq("id", userId)
      .single();
    if (profile?.photos) {
      const remaining = (profile.photos as string[]).filter((p) => p !== path);
      if (remaining.length !== profile.photos.length) {
        await supabase
          .from("profiles")
          .update({ photos: remaining })
          .eq("id", userId);
      }
    }
  }

  return jsonResponse({
    result: flagged ? "flagged" : "allowed",
    flagged_categories: flaggedCategories,
  });
});
