// Edge function: scan a freshly-uploaded profile photo via Google Cloud
// Vision SafeSearch + Label Detection. Per PRD §7.4:
//   - SafeSearch flag if LIKELY+ on adult / violence / racy / spoof
//   - Label-based flag if any returned label matches our lists for
//     nudity / hate speech / hate symbols / drugs / weapons
// Flagged photos are removed from the user's profile.photos array
// immediately and a photo_moderation row is queued for human review.
//
// IMPORTANT: skips Vision entirely for seed/demo users (PRD AC-SD-06 +
// preserves Cloud Vision credit budget). The skip happens both
// client-side (the helper short-circuits for is_seed users) and here
// as a belt-and-suspenders check.
//
// Deploy:  supabase functions deploy moderate-photo
// Secret:  supabase secrets set GOOGLE_VISION_API_KEY=...

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const GOOGLE_VISION_API_KEY = Deno.env.get("GOOGLE_VISION_API_KEY") ?? "";

const FLAGGED_LIKELIHOODS = new Set(["LIKELY", "VERY_LIKELY"]);

// PRD §7.4: SafeSearch categories that trigger a flag.
const SAFE_SEARCH_CATEGORIES = ["adult", "violence", "racy", "spoof"] as const;

// Label keywords that should also flag a photo. Vision returns labels with
// confidence scores; we match these substrings (case-insensitive) on the
// label description and require a minimum score so harmless near-matches
// (e.g., "barbecue" matching "smoke") don't slip through.
const LABEL_MIN_SCORE = 0.7;
const LABEL_FLAG_TERMS: Record<string, string[]> = {
  nudity: [
    "nudity",
    "nude",
    "naked",
    "bare chest",
    "topless",
    "underwear",
    "lingerie",
    "bikini",
    "swimwear",
    "intimate",
    "explicit",
    "porn",
  ],
  hate_speech: [
    "hate speech",
    "racism",
    "racist",
    "anti-semitism",
    "white supremacy",
    "extremism",
    "extremist",
    "neo-nazi",
    "skinhead",
    "kkk",
    "ku klux klan",
  ],
  hate_symbol: [
    "swastika",
    "iron cross",
    "nazi",
    "nazism",
    "ss bolt",
    "confederate flag",
    "burning cross",
    "hate symbol",
    "white power",
  ],
  drug: [
    "drug",
    "cocaine",
    "heroin",
    "methamphetamine",
    "meth ",
    "syringe",
    "needle",
    "pill bottle",
    "marijuana",
    "cannabis",
    "joint",
    "blunt",
    "bong",
    "pipe",
    "drug paraphernalia",
  ],
  weapon: [
    "weapon",
    "gun",
    "firearm",
    "rifle",
    "pistol",
    "handgun",
    "shotgun",
    "assault weapon",
    "knife",
    "blade",
    "machete",
    "sword",
    "ammunition",
    "bullet",
    "magazine",
    "grenade",
    "explosive",
  ],
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ModerationResponse {
  result: "allowed" | "flagged" | "skipped" | "error";
  flagged_categories: string[];
  flagged_labels?: string[];
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

interface VisionLabel {
  description: string;
  score: number;
}

interface VisionResult {
  safeSearch: SafeSearchAnnotation | null;
  labels: VisionLabel[];
}

async function callVision(base64: string): Promise<VisionResult | null> {
  if (!GOOGLE_VISION_API_KEY) {
    console.warn("GOOGLE_VISION_API_KEY missing — skipping Vision call");
    return null;
  }
  const res = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            image: { content: base64 },
            features: [
              { type: "SAFE_SEARCH_DETECTION" },
              { type: "LABEL_DETECTION", maxResults: 25 },
            ],
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
  const resp = body?.responses?.[0];
  if (resp?.error) {
    console.warn("Vision API responded with error:", resp.error?.message);
    return null;
  }
  return {
    safeSearch: resp?.safeSearchAnnotation ?? null,
    labels: (resp?.labelAnnotations ?? []) as VisionLabel[],
  };
}

interface LabelMatch {
  category: string; // nudity / hate_speech / hate_symbol / drug / weapon
  label: string; // the actual returned description (e.g., "Handgun")
  term: string; // which term in our list matched
  score: number;
}

function findLabelMatches(labels: VisionLabel[]): LabelMatch[] {
  const matches: LabelMatch[] = [];
  for (const l of labels) {
    if (!l?.description) continue;
    if (typeof l.score !== "number" || l.score < LABEL_MIN_SCORE) continue;
    const desc = l.description.toLowerCase();
    for (const [category, terms] of Object.entries(LABEL_FLAG_TERMS)) {
      for (const term of terms) {
        if (desc.includes(term)) {
          matches.push({
            category,
            label: l.description,
            term,
            score: l.score,
          });
          break; // one match per label is enough
        }
      }
    }
  }
  return matches;
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST")
    return jsonResponse(
      { result: "error", flagged_categories: [], reason: "POST only" },
      405
    );

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

  const vision = await callVision(img.base64);
  if (!vision) {
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

  // SafeSearch evaluation
  const safe = vision.safeSearch;
  const safeFlagged: string[] = [];
  if (safe) {
    for (const cat of SAFE_SEARCH_CATEGORIES) {
      if (FLAGGED_LIKELIHOODS.has((safe as Record<string, string>)[cat])) {
        safeFlagged.push(cat);
      }
    }
  }

  // Label evaluation
  const labelMatches = findLabelMatches(vision.labels);
  const labelFlaggedCategories = Array.from(
    new Set(labelMatches.map((m) => m.category))
  );
  const flaggedLabels = labelMatches.map((m) => m.label);

  const allFlaggedCategories = Array.from(
    new Set([...safeFlagged, ...labelFlaggedCategories])
  );
  const flagged = allFlaggedCategories.length > 0;

  await supabase.from("photo_moderation").insert({
    user_id: userId,
    photo_path: path,
    bucket,
    result: flagged ? "flagged" : "allowed",
    adult_likelihood: safe?.adult ?? null,
    violence_likelihood: safe?.violence ?? null,
    racy_likelihood: safe?.racy ?? null,
    spoof_likelihood: safe?.spoof ?? null,
    medical_likelihood: safe?.medical ?? null,
    flagged_categories: flagged ? allFlaggedCategories : null,
    flagged_labels: flaggedLabels.length > 0 ? flaggedLabels : null,
  });

  // If flagged, remove from the user's photos array immediately
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
    flagged_categories: allFlaggedCategories,
    flagged_labels: flaggedLabels.length > 0 ? flaggedLabels : undefined,
  });
});
